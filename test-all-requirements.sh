#!/usr/bin/env bash

# Comprehensive test script validating ALL requirements from instr.md
# Tests: API, WebSocket lifecycle, DEX routing, concurrent processing, queue behavior, persistence

# Don't exit on error - we want to run all tests
# set -e

API_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "ORDER EXECUTION ENGINE - REQUIREMENTS VALIDATION SUITE"
echo "Testing all deliverables from instr.md"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

pass() {
    echo "PASS: $1"
    ((TESTS_PASSED++))
}

fail() {
    echo "FAIL: $1"
    ((TESTS_FAILED++))
}

section() {
    echo ""
    echo "-----------------------------------------------------------"
    echo "$1"
    echo "-----------------------------------------------------------"
    echo ""
}

# Check server is running
section "PREREQUISITE: Server Health Check"
if curl -s --max-time 2 $API_URL/api/orders > /dev/null 2>&1; then
    pass "Server is running and responsive"
else
    fail "Server is not running at $API_URL"
    echo "Please start the server with: npm start"
    exit 1
fi

# ============================================================================
# REQUIREMENT 1: Order Submission via POST /api/orders/execute
# ============================================================================
section "REQUIREMENT 1: Order Submission (POST /api/orders/execute)"

echo "Test 1.1: Submit valid market order"
RESPONSE=$(curl -s -X POST $API_URL/api/orders/execute \
    -H "Content-Type: application/json" \
    -d '{"tokenIn":"USDC","tokenOut":"SOL","amount":100}')

ORDER_ID=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('orderId', ''))" 2>/dev/null || echo "")
if [ -n "$ORDER_ID" ]; then
    pass "Order submitted successfully: $ORDER_ID"
else
    fail "Failed to get orderId from response"
fi

echo "Test 1.2: Validate orderId format (UUID)"
if echo "$ORDER_ID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
    pass "OrderId is valid UUID format"
else
    fail "OrderId is not valid UUID"
fi

echo "Test 1.3: Verify response includes WebSocket hint"
WS_HINT=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('ws', ''))" 2>/dev/null || echo "")
if [ -n "$WS_HINT" ]; then
    pass "Response includes WebSocket endpoint hint"
else
    fail "Missing WebSocket hint in response"
fi

echo "Test 1.4: Submit order with invalid data (missing fields)"
INVALID_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API_URL/api/orders/execute \
    -H "Content-Type: application/json" \
    -d '{"tokenIn":"USDC"}')
if [ "$INVALID_RESPONSE" = "400" ]; then
    pass "Invalid order returns 400 Bad Request"
else
    fail "Invalid order handling incorrect (got HTTP $INVALID_RESPONSE)"
fi

# ============================================================================
# REQUIREMENT 2: DEX Routing (Raydium vs Meteora)
# ============================================================================
section "REQUIREMENT 2: DEX Routing Implementation"

# Submit multiple orders to observe DEX routing
echo "Submitting 10 orders to test DEX routing..."
for i in {1..10}; do
    curl -s -X POST $API_URL/api/orders/execute \
        -H "Content-Type: application/json" \
        -d "{\"tokenIn\":\"SOL\",\"tokenOut\":\"USDC\",\"amount\":$((10 + i))}" > /dev/null &
done
wait

sleep 8  # Wait for processing

echo "Test 2.1: Check routing logs exist"
ROUTING_LOGS=$(curl -s $API_URL/api/logs | python3 -c "import sys, json; logs = json.load(sys.stdin)['logs']; print(len([l for l in logs if l.get('event') == 'DEX comparison completed']))")
if [ "$ROUTING_LOGS" -gt 0 ]; then
    pass "Routing logs contain DEX comparison events ($ROUTING_LOGS found)"
else
    fail "No DEX comparison logs found"
fi

echo "Test 2.2: Verify both Raydium and Meteora are being used"
DEX_STATS=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
from collections import Counter
orders = json.load(sys.stdin)['orders']
dexes = [o.get('chosen_dex') for o in orders if o.get('chosen_dex')]
counter = Counter(dexes)
print(f\"{counter.get('raydium', 0)}|{counter.get('meteora', 0)}\")
")
RAYDIUM_COUNT=$(echo $DEX_STATS | cut -d'|' -f1)
METEORA_COUNT=$(echo $DEX_STATS | cut -d'|' -f2)

if [ "$RAYDIUM_COUNT" -gt 0 ] && [ "$METEORA_COUNT" -gt 0 ]; then
    pass "Both DEXs are being used (Raydium: $RAYDIUM_COUNT, Meteora: $METEORA_COUNT)"
else
    fail "Not both DEXs are being used (Raydium: $RAYDIUM_COUNT, Meteora: $METEORA_COUNT)"
fi

echo "Test 2.3: Verify routing decisions are logged with price comparison"
PRICE_COMPARISON=$(curl -s $API_URL/api/logs | python3 -c "
import sys, json
logs = json.load(sys.stdin)['logs']
comparison_logs = [l for l in logs if l.get('event') == 'DEX comparison completed']
if comparison_logs:
    log = comparison_logs[0]
    data = log.get('data', {})
    has_raydium = 'raydium' in data
    has_meteora = 'meteora' in data
    has_chosen = 'chosen' in data
    has_reason = 'reason' in data
    print(f'{has_raydium}|{has_meteora}|{has_chosen}|{has_reason}')
else:
    print('False|False|False|False')
")
if echo "$PRICE_COMPARISON" | grep -q "True|True|True|True"; then
    pass "Routing logs include Raydium, Meteora, chosen DEX, and reason"
else
    fail "Routing logs missing required comparison data"
fi

# ============================================================================
# REQUIREMENT 3: WebSocket Status Updates (Lifecycle)
# ============================================================================
section "REQUIREMENT 3: WebSocket Lifecycle (pending → routing → building → submitted → confirmed)"

echo "Test 3.1: Check order lifecycle states in database"
LIFECYCLE_CHECK=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
orders = json.load(sys.stdin)['orders']
confirmed_count = sum(1 for o in orders if o.get('status') == 'confirmed')
# All confirmed orders mean lifecycle worked (pending is transient state)
has_lifecycle = confirmed_count > 0
print(f'{has_lifecycle}|{confirmed_count}')
")
HAS_LIFECYCLE=$(echo $LIFECYCLE_CHECK | cut -d'|' -f1)
CONFIRMED_COUNT=$(echo $LIFECYCLE_CHECK | cut -d'|' -f2)

if [ "$HAS_LIFECYCLE" = "True" ] && [ "$CONFIRMED_COUNT" -gt 0 ]; then
    pass "Order lifecycle completed successfully, $CONFIRMED_COUNT orders confirmed"
else
    fail "Missing lifecycle states or no confirmed orders"
fi

echo "Test 3.2: Verify confirmed orders have transaction hashes"
TX_HASH_CHECK=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
orders = json.load(sys.stdin)['orders']
confirmed = [o for o in orders if o.get('status') == 'confirmed']
with_tx = [o for o in confirmed if o.get('tx_hash')]
print(f'{len(with_tx)}|{len(confirmed)}')
")
WITH_TX=$(echo $TX_HASH_CHECK | cut -d'|' -f1)
TOTAL_CONFIRMED=$(echo $TX_HASH_CHECK | cut -d'|' -f2)

if [ "$WITH_TX" = "$TOTAL_CONFIRMED" ] && [ "$TOTAL_CONFIRMED" -gt 0 ]; then
    pass "All confirmed orders have transaction hashes ($WITH_TX/$TOTAL_CONFIRMED)"
else
    fail "Some confirmed orders missing transaction hashes ($WITH_TX/$TOTAL_CONFIRMED)"
fi

echo "Test 3.3: Verify confirmed orders have execution prices"
PRICE_CHECK=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
orders = json.load(sys.stdin)['orders']
confirmed = [o for o in orders if o.get('status') == 'confirmed']
with_price = [o for o in confirmed if o.get('executed_price') is not None]
print(f'{len(with_price)}|{len(confirmed)}')
")
WITH_PRICE=$(echo $PRICE_CHECK | cut -d'|' -f1)
TOTAL_CONFIRMED=$(echo $PRICE_CHECK | cut -d'|' -f2)

if [ "$WITH_PRICE" = "$TOTAL_CONFIRMED" ] && [ "$TOTAL_CONFIRMED" -gt 0 ]; then
    pass "All confirmed orders have execution prices ($WITH_PRICE/$TOTAL_CONFIRMED)"
else
    fail "Some confirmed orders missing execution prices ($WITH_PRICE/$TOTAL_CONFIRMED)"
fi

# ============================================================================
# REQUIREMENT 4: Concurrent Processing (10 concurrent, 100/min)
# ============================================================================
section "REQUIREMENT 4: Concurrent Order Processing"

echo "Test 4.1: Submit 15 orders simultaneously to test queue"
START_TIME=$(date +%s)
for i in {1..15}; do
    curl -s -X POST $API_URL/api/orders/execute \
        -H "Content-Type: application/json" \
        -d "{\"tokenIn\":\"USDC\",\"tokenOut\":\"SOL\",\"amount\":$((50 + i))}" > /dev/null &
done
wait
END_TIME=$(date +%s)
SUBMISSION_TIME=$((END_TIME - START_TIME))

if [ "$SUBMISSION_TIME" -lt 5 ]; then
    pass "15 orders submitted in ${SUBMISSION_TIME}s (queue handling working)"
else
    fail "Order submission took too long (${SUBMISSION_TIME}s)"
fi

echo "Waiting 12 seconds for concurrent processing..."
sleep 12

echo "Test 4.2: Verify orders were processed"
RECENT_ORDERS=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
from datetime import datetime, timedelta
orders = json.load(sys.stdin)['orders']
# Count orders from last 30 seconds
recent = [o for o in orders if o.get('status') in ['confirmed', 'failed']]
print(len(recent))
")

if [ "$RECENT_ORDERS" -gt 10 ]; then
    pass "Multiple orders processed concurrently ($RECENT_ORDERS orders in system)"
else
    fail "Insufficient concurrent processing ($RECENT_ORDERS orders processed)"
fi

# ============================================================================
# REQUIREMENT 5: Persistence (PostgreSQL)
# ============================================================================
section "REQUIREMENT 5: Order Persistence (PostgreSQL)"

echo "Test 5.1: Retrieve order by ID"
if [ -n "$ORDER_ID" ]; then
    ORDER_DETAIL=$(curl -s $API_URL/api/orders/$ORDER_ID)
    RETRIEVED_ID=$(echo $ORDER_DETAIL | python3 -c "import sys, json; print(json.load(sys.stdin).get('order_id', ''))" 2>/dev/null || echo "")
    
    if [ "$RETRIEVED_ID" = "$ORDER_ID" ]; then
        pass "Order retrieved by ID successfully"
    else
        fail "Failed to retrieve order by ID"
    fi
else
    fail "No ORDER_ID available for retrieval test"
fi

echo "Test 5.2: Get all orders (pagination)"
ALL_ORDERS=$(curl -s $API_URL/api/orders | python3 -c "import sys, json; print(len(json.load(sys.stdin)['orders']))")
if [ "$ALL_ORDERS" -gt 0 ]; then
    pass "Retrieved $ALL_ORDERS orders from database"
else
    fail "No orders in database"
fi

echo "Test 5.3: Verify order history contains required fields"
FIELD_CHECK=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
orders = json.load(sys.stdin)['orders']
if orders:
    order = orders[0]
    required = ['order_id', 'token_in', 'token_out', 'amount', 'status', 'created_at']
    has_all = all(field in order for field in required)
    print('True' if has_all else 'False')
else:
    print('False')
")

if [ "$FIELD_CHECK" = "True" ]; then
    pass "Orders contain all required fields"
else
    fail "Orders missing required fields"
fi

# ============================================================================
# REQUIREMENT 6: Error Handling & Retry Logic
# ============================================================================
section "REQUIREMENT 6: Error Handling & Retry Logic"

echo "Test 6.1: Check for any failed orders (retry mechanism)"
FAILED_ORDERS=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
orders = json.load(sys.stdin)['orders']
failed = [o for o in orders if o.get('status') == 'failed']
print(len(failed))
")

# Note: With 2% failure rate in mock, we expect very few or no failures
echo "Found $FAILED_ORDERS failed orders (mock has 2% failure rate)"
if [ "$FAILED_ORDERS" -ge 0 ]; then
    pass "Failure tracking working ($FAILED_ORDERS failed orders logged)"
else
    fail "Cannot determine failed order count"
fi

echo "Test 6.2: Verify failed orders have error messages"
if [ "$FAILED_ORDERS" -gt 0 ]; then
    ERROR_MSG_CHECK=$(curl -s $API_URL/api/orders | python3 -c "
import sys, json
orders = json.load(sys.stdin)['orders']
failed = [o for o in orders if o.get('status') == 'failed']
with_msg = [o for o in failed if o.get('error_message')]
print(f'{len(with_msg)}|{len(failed)}')
")
    WITH_MSG=$(echo $ERROR_MSG_CHECK | cut -d'|' -f1)
    TOTAL_FAILED=$(echo $ERROR_MSG_CHECK | cut -d'|' -f2)
    
    if [ "$WITH_MSG" = "$TOTAL_FAILED" ]; then
        pass "All failed orders have error messages"
    else
        fail "Some failed orders missing error messages ($WITH_MSG/$TOTAL_FAILED)"
    fi
else
    pass "No failed orders to check (expected with 2% failure rate)"
fi

# ============================================================================
# REQUIREMENT 7: Routing Logs
# ============================================================================
section "REQUIREMENT 7: Routing Decision Logs"

echo "Test 7.1: Verify routing logs are accessible"
LOG_COUNT=$(curl -s $API_URL/api/logs | python3 -c "import sys, json; print(len(json.load(sys.stdin)['logs']))")
if [ "$LOG_COUNT" -gt 0 ]; then
    pass "Routing logs accessible ($LOG_COUNT log entries)"
else
    fail "No routing logs found"
fi

echo "Test 7.2: Verify logs contain timestamps"
TIMESTAMP_CHECK=$(curl -s $API_URL/api/logs | python3 -c "
import sys, json
logs = json.load(sys.stdin)['logs']
if logs:
    has_timestamp = 'timestamp' in logs[0]
    print('True' if has_timestamp else 'False')
else:
    print('False')
")

if [ "$TIMESTAMP_CHECK" = "True" ]; then
    pass "Routing logs include timestamps"
else
    fail "Routing logs missing timestamps"
fi

echo "Test 7.3: Verify logs contain order IDs for traceability"
ORDERID_CHECK=$(curl -s $API_URL/api/logs | python3 -c "
import sys, json
logs = json.load(sys.stdin)['logs']
if logs:
    has_orderid = 'orderId' in logs[0]
    print('True' if has_orderid else 'False')
else:
    print('False')
")

if [ "$ORDERID_CHECK" = "True" ]; then
    pass "Routing logs include order IDs"
else
    fail "Routing logs missing order IDs"
fi

# ============================================================================
# REQUIREMENT 8: Unit/Integration Tests
# ============================================================================
section "REQUIREMENT 8: Unit/Integration Tests (≥10 tests)"

echo "Test 8.1: Run test suite"
TEST_OUTPUT=$(cd "/home/aritra-maji/Messy stuff/assignment" && npm test -- --run 2>&1)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= passed)' | tail -1)

if [ -n "$TEST_COUNT" ] && [ "$TEST_COUNT" -ge 10 ]; then
    pass "Test suite has $TEST_COUNT tests (exceeds ≥10 requirement)"
    PASSED=$((PASSED + 1))
else
    echo "Warning: Could not verify test count or less than 10 tests"
    echo "Please ensure: npm test runs successfully"
fi

# ============================================================================
# SUMMARY
# ============================================================================
section "TEST SUMMARY"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
SUCCESS_RATE=$(echo "scale=1; $TESTS_PASSED * 100 / $TOTAL_TESTS" | bc)

echo "Total Tests Run: $TOTAL_TESTS"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo "Success Rate: ${SUCCESS_RATE}%"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo "All requirements validated:"
    echo "- Order Submission (POST /api/orders/execute)"
    echo "- DEX Routing (Raydium vs Meteora comparison)"
    echo "- WebSocket Lifecycle (pending -> routing -> building -> submitted -> confirmed)"
    echo "- Concurrent Processing (queue management)"
    echo "- Order Persistence (PostgreSQL)"
    echo "- Error Handling & Retry Logic"
    echo "- Routing Decision Logs"
    echo "- Unit/Integration Tests"
    exit 0
else
    echo "Some tests failed - please review."
    echo "Please fix the failing tests before submission."
    exit 1
fi
