#!/bin/bash

# Integration Test Script for Tool Registry
# Tests Steps 8 and 9: Voice server and text agent startup
#
# Usage: ./scripts/Testing/integration/test-integration.sh

set -e

echo "🧪 Tool Registry Integration Tests"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0

# Function to check if a process is running on a port
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0
    else
        return 1
    fi
}

# Function to wait for a process to start
wait_for_server() {
    local port=$1
    local name=$2
    local max_attempts=30
    local attempt=0
    
    echo -n "Waiting for $name to start on port $port..."
    while [ $attempt -lt $max_attempts ]; do
        if check_port $port; then
            echo -e " ${GREEN}✓${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done
    echo -e " ${RED}✗${NC}"
    return 1
}

# Function to check log output for success patterns
check_log_pattern() {
    local log_file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$log_file" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $description"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "  ${RED}✗${NC} $description"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "Step 1: Building tool registry..."
echo "---------------------------------"
cd "$(dirname "$0")/../../.." || exit 1

if npm run build:tools > /tmp/tool-build.log 2>&1; then
    echo -e "${GREEN}✓${NC} Tool registry built successfully"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Tool registry build failed"
    echo "Build log:"
    cat /tmp/tool-build.log
    FAILED=$((FAILED + 1))
    exit 1
fi

echo ""
echo "Step 2: Testing Voice Server Startup (Step 8)"
echo "-----------------------------------------------"

# Check if voice server port is already in use
if check_port 8080; then
    echo -e "${YELLOW}⚠${NC} Port 8080 is already in use. Stopping existing process..."
    lsof -ti:8080 | xargs kill 2>/dev/null || true
    sleep 0.5
    lsof -ti:8080 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start voice server in background
echo "Starting voice server..."
cd voice-server || exit 1
npm start > /tmp/voice-server.log 2>&1 &
VOICE_PID=$!
cd ..

# Wait for server to start
if wait_for_server 8080 "Voice Server"; then
    PASSED=$((PASSED + 1))
    
    # Check logs for registry loading
    sleep 2
    check_log_pattern /tmp/voice-server.log "Tool registry loaded" "Registry loaded successfully"
    check_log_pattern /tmp/voice-server.log "Voice Server listening" "Server started successfully"
    
    # Test health endpoint
    echo ""
    echo "Testing health endpoint..."
    if curl -s http://localhost:8080/health > /tmp/health-response.json 2>&1; then
        echo -e "  ${GREEN}✓${NC} Health endpoint responding"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}✗${NC} Health endpoint failed"
        FAILED=$((FAILED + 1))
    fi
    
    # Stop voice server
    echo ""
    echo "Stopping voice server..."
    kill $VOICE_PID 2>/dev/null || true
    wait $VOICE_PID 2>/dev/null || true
else
    echo -e "${RED}✗${NC} Voice server failed to start"
    echo "Logs:"
    tail -20 /tmp/voice-server.log
    FAILED=$((FAILED + 1))
fi

echo ""
echo "Step 3: Testing Text Agent Startup (Step 9)"
echo "---------------------------------------------"

# Check if Next.js port is already in use
if check_port 3000; then
    echo -e "${YELLOW}⚠${NC} Port 3000 is already in use. Stopping existing process..."
    lsof -ti:3000 | xargs kill 2>/dev/null || true
    sleep 0.5
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start Next.js in background
echo "Starting Next.js dev server..."
npm run dev > /tmp/nextjs.log 2>&1 &
NEXTJS_PID=$!

# Wait for server to start
if wait_for_server 3000 "Next.js"; then
    PASSED=$((PASSED + 1))
    
    # Wait a bit for compilation
    sleep 5
    
    # Test API endpoint
    echo ""
    echo "Testing API endpoint..."
    if curl -s -X POST http://localhost:3000/api/chat \
        -H "Content-Type: application/json" \
        -d '{"messages":[{"role":"user","content":"test"}]}' > /tmp/api-response.json 2>&1; then
        echo -e "  ${GREEN}✓${NC} API endpoint responding"
        PASSED=$((PASSED + 1))
        
        # Check logs for registry loading
        sleep 2
        check_log_pattern /tmp/nextjs.log "Tool registry loaded" "Registry loaded in text agent"
    else
        echo -e "  ${RED}✗${NC} API endpoint failed"
        FAILED=$((FAILED + 1))
    fi
    
    # Stop Next.js
    echo ""
    echo "Stopping Next.js..."
    kill $NEXTJS_PID 2>/dev/null || true
    wait $NEXTJS_PID 2>/dev/null || true
else
    echo -e "${RED}✗${NC} Next.js failed to start"
    echo "Logs:"
    tail -20 /tmp/nextjs.log
    FAILED=$((FAILED + 1))
fi

# Summary
echo ""
echo "=================================="
echo "TEST SUMMARY"
echo "=================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
