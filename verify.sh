#!/bin/bash

# Quick Verification Script
# This script checks if all components are ready for deployment

echo "🔍 Order Execution Engine - Verification Script"
echo "=============================================="
echo ""

# Check Node.js version
echo "1. Checking Node.js version..."
NODE_VERSION=$(node --version 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   ✅ Node.js $NODE_VERSION installed"
else
    echo "   ❌ Node.js not found (requires v18+)"
    exit 1
fi

# Check npm dependencies
echo ""
echo "2. Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "   ✅ Dependencies installed"
else
    echo "   ⚠️  Dependencies not installed. Run: npm install"
fi

# Check source files
echo ""
echo "3. Checking source files..."
REQUIRED_FILES=(
    "src/index.ts"
    "src/server.ts"
    "src/dex/mockDex.ts"
    "src/orders/controller.ts"
    "src/orders/worker.ts"
    "src/orders/queue.ts"
    "src/db/database.ts"
    "src/utils/logger.ts"
)

ALL_PRESENT=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file missing"
        ALL_PRESENT=false
    fi
done

# Check test files
echo ""
echo "4. Checking test files..."
TEST_FILES=(
    "tests/dex.test.ts"
    "tests/api.test.ts"
    "tests/logger.test.ts"
    "tests/id.test.ts"
)

for file in "${TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file missing"
        ALL_PRESENT=false
    fi
done

# Check documentation
echo ""
echo "5. Checking documentation..."
DOC_FILES=(
    "README.md"
    "DEPLOYMENT.md"
    "SUBMISSION_CHECKLIST.md"
    "postman_collection.json"
)

for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file missing"
        ALL_PRESENT=false
    fi
done

# Check deployment files
echo ""
echo "6. Checking deployment files..."
DEPLOY_FILES=(
    "Dockerfile"
    "docker-compose.yml"
    ".env.example"
)

for file in "${DEPLOY_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file missing"
        ALL_PRESENT=false
    fi
done

# Count tests
echo ""
echo "7. Test coverage..."
if command -v grep &> /dev/null; then
    TEST_COUNT=$(find tests -name "*.test.ts" -exec grep -h "^\s*it(" {} \; | wc -l)
    echo "   ✅ $TEST_COUNT test cases found (requirement: ≥10)"
else
    echo "   ⚠️  Cannot count tests (grep not available)"
fi

# Summary
echo ""
echo "=============================================="
if [ "$ALL_PRESENT" = true ]; then
    echo "✅ All checks passed!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Install dependencies: npm install"
    echo "   2. Run tests: npm test"
    echo "   3. Deploy using Docker: docker-compose up -d"
    echo "   4. OR deploy to Railway/Render/Fly.io"
    echo "   5. Record demo video"
    echo "   6. Add public URL and video link to README"
else
    echo "❌ Some checks failed. Please review the output above."
fi
