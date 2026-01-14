#!/bin/bash

# Integration Test Script for Tool Registry
# Tests Steps 8 and 9: Voice server and text agent startup

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
cd "$(dirname "$0")/.." || exit 1

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
    
    # Check log for registry loading
    sleep 2  # Give it time to initialize
    echo ""
    echo "Checking voice server logs..."
    
    check_log_pattern /tmp/voice-server.log "Tool registry loaded" "Registry loaded successfully"
    check_log_pattern /tmp/voice-server.log "Voice Server listening" "Server started successfully"
    check_log_pattern /tmp/voice-server.log "tools," "Tools count displayed"
    
    # Test health endpoint
    echo ""
    echo "Testing health endpoint..."
    if curl -s http://localhost:8080/health | grep -q "ok"; then
        echo -e "  ${GREEN}✓${NC} Health endpoint responding"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}✗${NC} Health endpoint not responding"
        FAILED=$((FAILED + 1))
    fi
    
    # Stop voice server
    echo ""
    echo "Stopping voice server..."
    kill $VOICE_PID 2>/dev/null || true
    wait $VOICE_PID 2>/dev/null || true
    sleep 1
    
    # Show relevant log lines
    echo ""
    echo "Voice server log summary:"
    echo "------------------------"
    grep -E "(Tool registry|Voice Server|tools,|ERROR|CRASH)" /tmp/voice-server.log | head -10 || echo "No relevant log entries found"
    
else
    echo -e "${RED}✗${NC} Voice server failed to start"
    FAILED=$((FAILED + 1))
    echo ""
    echo "Voice server log:"
    tail -20 /tmp/voice-server.log
    kill $VOICE_PID 2>/dev/null || true
fi

echo ""
echo "Step 3: Testing Text Agent Startup (Step 9)"
echo "---------------------------------------------"

# Check if Next.js port is already in use
if check_port 3000; then
    echo -e "${YELLOW}⚠${NC} Port 3000 is already in use. Stopping existing process..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start Next.js dev server in background
echo "Starting Next.js dev server..."
npm run dev > /tmp/next-server.log 2>&1 &
NEXT_PID=$!

# Wait for server to start
if wait_for_server 3000 "Next.js Server"; then
    PASSED=$((PASSED + 1))
    
    # Wait for Next.js to compile
    sleep 5  # Give it time to compile and initialize
    echo ""
    echo "Testing API endpoint (triggers registry load)..."
    
    # Test API endpoint - this will trigger registry loading
    RESPONSE=$(curl -s -X POST http://localhost:3000/api/chat \
        -H "Content-Type: application/json" \
        -d '{"messages":[{"role":"user","content":"test"}]}' 2>&1)
    
    # Wait a bit for logs to be written
    sleep 2
    
    echo ""
    echo "Checking Next.js logs..."
    
    # Registry loads on first API request, so check after API call
    check_log_pattern /tmp/next-server.log "Tool registry loaded" "Registry loaded successfully"
    
    if echo "$RESPONSE" | grep -q "No messages provided\|GEMINI_API_KEY\|message\|error"; then
        echo -e "  ${GREEN}✓${NC} API endpoint responding"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${YELLOW}⚠${NC} Unexpected API response"
        echo "    Response preview: $(echo "$RESPONSE" | head -c 100)"
    fi
    
    # Stop Next.js server
    echo ""
    echo "Stopping Next.js server..."
    kill $NEXT_PID 2>/dev/null || true
    wait $NEXT_PID 2>/dev/null || true
    sleep 2
    
    # Show relevant log lines
    echo ""
    echo "Next.js log summary:"
    echo "-------------------"
    grep -E "(Tool registry|ready|ERROR|compiled)" /tmp/next-server.log | head -10 || echo "No relevant log entries found"
    
else
    echo -e "${RED}✗${NC} Next.js server failed to start"
    FAILED=$((FAILED + 1))
    echo ""
    echo "Next.js log:"
    tail -30 /tmp/next-server.log
    kill $NEXT_PID 2>/dev/null || true
fi

echo ""
echo "=================================="
echo "Test Results Summary"
echo "=================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
