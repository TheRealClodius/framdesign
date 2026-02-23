#!/bin/bash
# Unified voice server monitoring script
# Usage: ./monitor-voice.sh [--snapshot|--simple|--detailed]

set -e

MODE="${1:---simple}"
VOICE_SERVER_LOG="${VOICE_SERVER_LOG:-/var/log/voice-server.log}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

highlight_tools() {
  while IFS= read -r line; do
    if echo "$line" | grep -q '"toolId":"kb_search"'; then
      echo -e "${GREEN}[KB-SEARCH]${NC} $line"
    elif echo "$line" | grep -q '"toolId":"kb_get"'; then
      echo -e "${BLUE}[KB-GET]${NC} $line"
    elif echo "$line" | grep -q '"error"'; then
      echo -e "${RED}[ERROR]${NC} $line"
    elif echo "$line" | grep -q 'tool_execution'; then
      echo -e "${YELLOW}[TOOL]${NC} $line"
    else
      echo "$line"
    fi
  done
}

case "$MODE" in
  --snapshot|-s)
    echo "=== Voice Server Logs (last 100 lines) ==="
    tail -100 "$VOICE_SERVER_LOG" 2>/dev/null | highlight_tools || \
      railway logs --tail 100 2>/dev/null | highlight_tools || \
      echo "Could not read voice server logs"
    ;;

  --simple)
    echo "=== Monitoring Voice Server (simple) ==="
    echo "Press Ctrl+C to stop"
    tail -f "$VOICE_SERVER_LOG" 2>/dev/null | highlight_tools || \
      railway logs --tail 50 2>/dev/null | highlight_tools || \
      echo "Could not tail voice server logs"
    ;;

  --detailed|-d)
    echo "=== Monitoring Voice Server (detailed) ==="
    echo "Press Ctrl+C to stop"
    tail -f "$VOICE_SERVER_LOG" 2>/dev/null | while IFS= read -r line; do
      if echo "$line" | grep -q '^{'; then
        echo "$line" | python3 -c "
import sys, json
try:
  d = json.loads(sys.stdin.read())
  if 'toolId' in d:
    print(f\"[{d.get('event', 'TOOL')}] {d['toolId']} - {d.get('duration', '?')}ms - ok={d.get('ok', '?')}\")
  else:
    print(json.dumps(d, indent=2))
except:
  pass
" 2>/dev/null || echo "$line"
      else
        highlight_tools <<< "$line"
      fi
    done || railway logs -f 2>/dev/null | highlight_tools
    ;;

  --help|-h)
    echo "Usage: $0 [--snapshot|--simple|--detailed]"
    echo ""
    echo "Modes:"
    echo "  --snapshot, -s   Show last 100 lines (read-only)"
    echo "  --simple         Real-time monitoring with highlighting (default)"
    echo "  --detailed, -d   Real-time with JSON parsing"
    echo ""
    echo "Environment:"
    echo "  VOICE_SERVER_LOG  Path to log file (default: /var/log/voice-server.log)"
    ;;

  *)
    echo "Unknown mode: $MODE"
    echo "Use --help for usage information"
    exit 1
    ;;
esac
