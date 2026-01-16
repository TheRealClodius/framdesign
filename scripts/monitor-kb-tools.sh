#!/bin/bash

# Real-time KB Tool Monitoring for Voice Server
# Shows KB tool executions with timestamps

echo "🔍 Monitoring Voice Server KB Tool Executions"
echo "=============================================="
echo "Press Ctrl+C to stop"
echo ""

# Function to add timestamp and highlight
format_line() {
    local line="$1"
    local timestamp=$(date '+%H:%M:%S.%3N')
    
    # Remove [VOICE] prefix
    line=$(echo "$line" | sed 's/^\[VOICE\] //')
    
    # Highlight different types
    if echo "$line" | grep -q "kb_search"; then
        echo -e "\033[1;32m[$timestamp] 🔍 KB_SEARCH: $line\033[0m"
    elif echo "$line" | grep -q "kb_get"; then
        echo -e "\033[1;33m[$timestamp] 📄 KB_GET: $line\033[0m"
    elif echo "$line" | grep -q "Executing tool"; then
        echo -e "\033[1;36m[$timestamp] ⚙️  TOOL_START: $line\033[0m"
    elif echo "$line" | grep -q "Calling executeTool"; then
        echo -e "\033[1;35m[$timestamp] 📞 EXECUTE: $line\033[0m"
    elif echo "$line" | grep -q "tool_execution"; then
        echo -e "\033[1;34m[$timestamp] 📊 TOOL_EXEC: $line\033[0m"
    elif echo "$line" | grep -q "Client connected"; then
        echo -e "\033[1;37m[$timestamp] 🔌 CONNECTION: $line\033[0m"
    else
        echo "[$timestamp] $line"
    fi
}

# Monitor the log file
tail -f /tmp/framdesign-dev.log 2>/dev/null | \
    grep --line-buffered "^\[VOICE\]" | \
    grep --line-buffered -E "(\[kb_|Executing tool|Calling executeTool|tool_execution|Client connected|Handling function call|Starting dynamic import|Importing from|module imported)" | \
    while IFS= read -r line; do
        format_line "$line"
    done
