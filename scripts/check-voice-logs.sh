#!/bin/bash

# Quick check of recent voice server logs for KB tool executions

echo "📊 Recent Voice Server Activity (KB Tools)"
echo "=========================================="
echo ""

# Check for KB tool executions in the last log entries
echo "Recent KB tool executions:"
tail -100 /tmp/framdesign-dev.log 2>/dev/null | \
    grep -E '\[VOICE\].*(kb_search|kb_get|tool_execution)' | \
    tail -20 | \
    sed 's/^\[VOICE\] //' | \
    while IFS= read -r line; do
        if echo "$line" | grep -q '"toolId":"kb_search"'; then
            echo -e "  🔍 KB_SEARCH: $line"
        elif echo "$line" | grep -q '"toolId":"kb_get"'; then
            echo -e "  📄 KB_GET: $line"
        elif echo "$line" | grep -q "kb_search\|kb_get"; then
            echo -e "  📝 KB_TOOL: $line"
        fi
    done

echo ""
echo "Recent connections:"
tail -50 /tmp/framdesign-dev.log 2>/dev/null | \
    grep -E '\[VOICE\].*Client connected' | \
    tail -5 | \
    sed 's/^\[VOICE\] //'

echo ""
echo "To monitor in real-time:"
echo "  ./scripts/monitor-voice-simple.sh"
