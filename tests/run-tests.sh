#!/bin/bash

# Test runner script for conversation memory management tests
# This script helps verify the test setup and run all tests

echo "🧪 Running Conversation Memory Management Tests"
echo "================================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "⚠️  node_modules not found. Installing dependencies..."
    npm install
    echo ""
fi

# Check if jest is installed
if ! command -v jest &> /dev/null && [ ! -f "node_modules/.bin/jest" ]; then
    echo "⚠️  Jest not found. Installing test dependencies..."
    npm install --save-dev jest @types/jest jest-environment-node
    echo ""
fi

echo "📋 Running all tests..."
echo ""

# Run tests
npm test

echo ""
echo "✅ Tests completed!"
echo ""
echo "💡 Tips:"
echo "   - Run 'npm test -- --watch' for watch mode"
echo "   - Run 'npm test -- --coverage' for coverage report"
echo "   - Run 'npm test <test-name>' to run specific test file"
