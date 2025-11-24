#!/usr/bin/env node

/**
 * Comprehensive Test Script for Order Execution Engine
 * Tests all features required by instr.md:
 * - Order submission via POST
 * - WebSocket status updates
 * - DEX routing (Raydium vs Meteora)
 * - Concurrent order processing
 * - Queue management
 * - Order history persistence
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/api/orders/execute';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60) + '\n');
}

// Test 1: Submit a single order
async function testSingleOrderSubmission() {
  logSection('TEST 1: Single Order Submission');
  
  try {
    const order = {
      tokenIn: 'USDC',
      tokenOut: 'SOL',
      amount: 100
    };
    
    log('Submitting order: ' + JSON.stringify(order), 'cyan');
    
    const response = await fetch(`${API_URL}/api/orders/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    log(`✓ Order submitted: ${result.orderId}`, 'green');
    return result.orderId;
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    throw error;
  }
}

// Test 2: WebSocket status updates
async function testWebSocketUpdates(orderId) {
  logSection('TEST 2: WebSocket Status Updates');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const statuses = [];
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout after 15 seconds'));
    }, 15000);
    
    ws.on('open', () => {
      log('WebSocket connected', 'cyan');
      // Subscribe to order updates
      ws.send(JSON.stringify({ orderId }));
    });
    
    ws.on('message', (data) => {
      try {
        const update = JSON.parse(data.toString());
        statuses.push(update.status);
        
        log(`Status: ${update.status}`, 'yellow');
        
        if (update.metadata) {
          if (update.metadata.dex) {
            log(`  → DEX chosen: ${update.metadata.dex}`, 'blue');
          }
          if (update.metadata.executedPrice) {
            log(`  → Executed price: ${update.metadata.executedPrice}`, 'blue');
          }
          if (update.metadata.txHash) {
            log(`  → TX Hash: ${update.metadata.txHash}`, 'blue');
          }
        }
        
        // Check if order is complete
        if (update.status === 'confirmed' || update.status === 'failed') {
          clearTimeout(timeout);
          ws.close();
          
          const expectedStates = ['pending', 'routing', 'building', 'submitted'];
          const hasAllStates = expectedStates.every(s => statuses.includes(s));
          
          if (hasAllStates) {
            log('✓ All lifecycle states observed', 'green');
            resolve({ orderId: update.orderId, finalStatus: update.status, statuses });
          } else {
            reject(new Error(`Missing states. Got: ${statuses.join(' → ')}`));
          }
        }
      } catch (error) {
        clearTimeout(timeout);
        ws.close();
        reject(error);
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

// Test 3: Submit multiple concurrent orders
async function testConcurrentOrders(count = 5) {
  logSection(`TEST 3: Submit ${count} Concurrent Orders`);
  
  const tokens = ['SOL', 'USDC', 'RAY', 'ORCA', 'BONK'];
  const orders = [];
  
  for (let i = 0; i < count; i++) {
    const tokenIn = tokens[i % tokens.length];
    const tokenOut = tokens[(i + 1) % tokens.length];
    const amount = Math.random() * 100 + 10;
    
    orders.push({
      tokenIn,
      tokenOut,
      amount: parseFloat(amount.toFixed(2))
    });
  }
  
  log(`Submitting ${count} orders simultaneously...`, 'cyan');
  
  try {
    const promises = orders.map(async (order, idx) => {
      const response = await fetch(`${API_URL}/api/orders/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      
      if (!response.ok) {
        throw new Error(`Order ${idx + 1} failed: HTTP ${response.status}`);
      }
      
      const result = await response.json();
      log(`  Order ${idx + 1}: ${result.orderId}`, 'yellow');
      return result.orderId;
    });
    
    const orderIds = await Promise.all(promises);
    log(`✓ All ${count} orders submitted successfully`, 'green');
    return orderIds;
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    throw error;
  }
}

// Test 4: Check order history
async function testOrderHistory() {
  logSection('TEST 4: Order History & Persistence');
  
  try {
    log('Fetching order history...', 'cyan');
    
    const response = await fetch(`${API_URL}/api/orders`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const orders = await response.json();
    log(`✓ Retrieved ${orders.length} orders from database`, 'green');
    
    // Show last 3 orders
    if (orders.length > 0) {
      log('\nLast 3 orders:', 'yellow');
      orders.slice(0, 3).forEach((order, idx) => {
        log(`  ${idx + 1}. ${order.orderId.slice(0, 8)}... | ${order.tokenIn}→${order.tokenOut} | Status: ${order.status}`, 'blue');
      });
    }
    
    return orders;
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    throw error;
  }
}

// Test 5: Check routing logs
async function testRoutingLogs() {
  logSection('TEST 5: DEX Routing Logs');
  
  try {
    log('Fetching routing decision logs...', 'cyan');
    
    const response = await fetch(`${API_URL}/api/logs`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const logs = await response.json();
    log(`✓ Retrieved ${logs.length} routing logs`, 'green');
    
    // Show last 5 logs
    if (logs.length > 0) {
      log('\nRecent routing decisions:', 'yellow');
      logs.slice(0, 5).forEach((entry, idx) => {
        log(`  ${idx + 1}. ${entry.orderId.slice(0, 8)}... | Chosen: ${entry.chosenDex} | Reason: ${entry.reason}`, 'blue');
      });
    }
    
    return logs;
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    throw error;
  }
}

// Test 6: Get specific order details
async function testGetOrderById(orderId) {
  logSection('TEST 6: Get Order by ID');
  
  try {
    log(`Fetching order: ${orderId}`, 'cyan');
    
    const response = await fetch(`${API_URL}/api/orders/${orderId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const order = await response.json();
    log('✓ Order details:', 'green');
    log(JSON.stringify(order, null, 2), 'blue');
    
    return order;
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    throw error;
  }
}

// Test 7: Monitor concurrent order processing
async function testConcurrentProcessing(orderIds) {
  logSection('TEST 7: Monitor Concurrent Order Processing');
  
  log(`Monitoring ${orderIds.length} orders via WebSocket...`, 'cyan');
  
  const completedOrders = new Map();
  const wsConnections = [];
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      wsConnections.forEach(ws => ws.close());
      reject(new Error('Concurrent processing timeout after 30 seconds'));
    }, 30000);
    
    orderIds.forEach((orderId, idx) => {
      const ws = new WebSocket(WS_URL);
      wsConnections.push(ws);
      
      ws.on('message', (data) => {
        try {
          const update = JSON.parse(data.toString());
          
          if (update.status === 'confirmed' || update.status === 'failed') {
            completedOrders.set(orderId, update.status);
            log(`  Order ${idx + 1}: ${update.status}`, update.status === 'confirmed' ? 'green' : 'red');
            
            // Check if all orders are complete
            if (completedOrders.size === orderIds.length) {
              clearTimeout(timeout);
              wsConnections.forEach(ws => ws.close());
              
              const confirmed = Array.from(completedOrders.values()).filter(s => s === 'confirmed').length;
              const failed = Array.from(completedOrders.values()).filter(s => s === 'failed').length;
              
              log(`\n✓ All orders processed: ${confirmed} confirmed, ${failed} failed`, 'green');
              resolve({ confirmed, failed });
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          wsConnections.forEach(ws => ws.close());
          reject(error);
        }
      });
      
      ws.on('open', () => {
        // Subscribe to order updates
        ws.send(JSON.stringify({ orderId }));
      });
      
      ws.on('error', (error) => {
        log(`  Order ${idx + 1} WebSocket error: ${error.message}`, 'red');
      });
    });
  });
}

// Main test runner
async function runAllTests() {
  console.clear();
  log('╔════════════════════════════════════════════════════════════╗', 'bright');
  log('║     ORDER EXECUTION ENGINE - COMPREHENSIVE TEST SUITE      ║', 'bright');
  log('╚════════════════════════════════════════════════════════════╝', 'bright');
  
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Wait for server to be ready
    log('\nWaiting for server...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 1: Single order submission
    const orderId = await testSingleOrderSubmission();
    results.passed++;
    
    // Test 2: WebSocket updates for single order
    await testWebSocketUpdates(orderId);
    results.passed++;
    
    // Wait a bit for order to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 3: Submit concurrent orders
    const concurrentOrderIds = await testConcurrentOrders(5);
    results.passed++;
    
    // Test 4: Check order history
    await testOrderHistory();
    results.passed++;
    
    // Test 5: Check routing logs
    await testRoutingLogs();
    results.passed++;
    
    // Test 6: Get specific order
    await testGetOrderById(orderId);
    results.passed++;
    
    // Test 7: Monitor concurrent processing
    await testConcurrentProcessing(concurrentOrderIds);
    results.passed++;
    
  } catch (error) {
    results.failed++;
    results.errors.push(error.message);
    log(`\nTest failed: ${error.message}`, 'red');
  }
  
  // Final summary
  logSection('TEST SUMMARY');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.errors.length > 0) {
    log('\nErrors:', 'red');
    results.errors.forEach((err, idx) => {
      log(`  ${idx + 1}. ${err}`, 'red');
    });
  }
  
  log('\n' + '='.repeat(60), 'bright');
  
  if (results.failed === 0) {
    log('✓ ALL TESTS PASSED - System is ready for deployment!', 'green');
    process.exit(0);
  } else {
    log('✗ SOME TESTS FAILED - Please fix issues before deployment', 'red');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  log(`\nFatal error: ${error.message}`, 'red');
  process.exit(1);
});
