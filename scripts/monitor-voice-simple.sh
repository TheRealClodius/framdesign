#!/bin/bash

# Simple Voice Server Log Monitor
# Shows all VOICE logs with timestamps, highlights KB tools

echo "🔍 Monitoring Voice Server Logs"
echo "================================="
echo "Press Ctrl+C to stop"
echo ""

# Monitor the log file
tail -f /tmp/framdesign-dev.log 2>/dev/null | \
    grep --line-buffered "^\[VOICE\]" | \
    sed 's/^\[VOICE\] //' | \
    while IFS= read -r line; do
        timestamp=$(date '+%H:%M:%S.%3N')
        
        # Highlight KB tool executions
        if echo "$line" | grep -q '"toolId":"kb_search"'; then
            echo -e "\033[1;32m[$timestamp] 🔍 KB_SEARCH: $line\033[0m"
        elif echo "$line" | grep -q '"toolId":"kb_get"'; then
            echo -e "\033[1;33m[$timestamp] 📄 KB_GET: $line\033[0m"
        elif echo "$line" | grep -q "kb_search\|kb_get"; then
            echo -e "\033[1;36m[$timestamp] 📝 KB_TOOL: $line\033[0m"
        elif echo "$line" | grep -q "Client connected"; then
            echo -e "\033[1;35m[$timestamp] 🔌 CONNECTION: $line\033[0m"
        elif echo "$line" | grep -q "tool_execution"; then
            echo -e "\033[1;34m[$timestamp] ⚙️  TOOL: $line\033[0m"
        else
            echo "[$timestamp] $line"
        fi
    done
