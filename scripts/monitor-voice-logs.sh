#!/bin/bash

# Monitor Voice Server Logs with Timestamps
# Filters and highlights KB tool executions

echo "🔍 Monitoring Voice Server Logs for KB Tool Executions"
echo "======================================================"
echo "Waiting for voice server activity..."
echo ""

# Function to format JSON tool execution logs
format_tool_log() {
    local line="$1"
    local timestamp=$(date '+%H:%M:%S.%3N')
    
    # Try to parse as JSON
    if echo "$line" | jq -e '.event == "tool_execution"' >/dev/null 2>&1; then
        local tool_id=$(echo "$line" | jq -r '.toolId // "unknown"')
        local duration=$(echo "$line" | jq -r '.duration // 0')
        local ok=$(echo "$line" | jq -r '.ok // false')
        local mode=$(echo "$line" | jq -r '.mode // "unknown"')
        
        if [ "$tool_id" = "kb_search" ] || [ "$tool_id" = "kb_get" ]; then
            local status_color="\033[1;32m"  # Green for success
            local status="✓"
            if [ "$ok" = "false" ]; then
                status_color="\033[1;31m"  # Red for failure
                status="✗"
            fi
            
            echo -e "${status_color}[$timestamp] KB TOOL: $tool_id${status} | Duration: ${duration}ms | Mode: $mode\033[0m"
            echo "  Full log: $line"
            echo ""
        fi
    fi
}

# Monitor concurrently output and filter for VOICE prefix
tail -f /tmp/framdesign-dev.log 2>/dev/null | \
    grep --line-buffered "^\[VOICE\]" | \
    sed 's/^\[VOICE\] //' | \
    while IFS= read -r line; do
        timestamp=$(date '+%H:%M:%S.%3N')
        
        # Check for KB tool related logs
        if echo "$line" | grep -qE "(kb_search|kb_get|tool_execution|Client connected)"; then
            # Format tool execution JSON logs
            if echo "$line" | grep -q "tool_execution"; then
                format_tool_log "$line"
            # Highlight other important events
            elif echo "$line" | grep -q "kb_search"; then
                echo -e "\033[1;32m[$timestamp] KB_SEARCH: $line\033[0m"
            elif echo "$line" | grep -q "kb_get"; then
                echo -e "\033[1;33m[$timestamp] KB_GET: $line\033[0m"
            elif echo "$line" | grep -q "Client connected"; then
                echo -e "\033[1;35m[$timestamp] CONNECTION: $line\033[0m"
            else
                echo "[$timestamp] $line"
            fi
        fi
    done
