# Text Agent Test Script Enhancements

## Overview

The text-agent-test.js script has been significantly enhanced to provide detailed context composition analysis and tool usage debugging capabilities. These improvements help diagnose why tools like `query_tool_memory` might be misused.

## What Changed

### 1. Enhanced API Observability (`app/api/chat/route.ts`)

Added comprehensive context metadata to the observability output:

**New ObservabilityContextStack fields:**
- `summaryLength` - Character count of conversation summary
- `summaryPreview` - First 100 chars of summary for quick inspection
- `toolCount` - Number of tools available to the agent
- `toolIds` - Array of all tool IDs (e.g., `["kb_search", "query_tool_memory", ...]`)
- `toolMemoryState` - Complete tool memory state breakdown:
  - `totalCalls` - Total tool executions recorded
  - `callsWithFullResponse` - How many have full responses available
  - `callsWithSummary` - How many have been summarized
  - `toolBreakdown` - Per-tool call counts (e.g., `{"kb_search": 2, "query_tool_memory": 1}`)

### 2. New Formatter Functions (`scripts/text-agent-test-formatter.js`)

#### `formatDetailedContextBreakdown(contextStack, toolMemoryState)`

Shows exactly what's in the model's context window at each turn:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DETAILED CONTEXT COMPOSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1] System Prompt & Tool Schemas
    ├─ Source: core.md + 7 tools
    ├─ Tools available: 7
    └─ Tool IDs: kb_search, kb_get, query_tool_memory, ...
    ✓ Cached (system + tools)

[2] Tool Memory Context
    ├─ Status: Active
    ├─ Total calls recorded: 3
    ├─ Calls with full responses: 3
    ├─ Calls with summaries: 0
    └─ By tool:
       • kb_search: 2 calls
       • query_tool_memory: 1 call

[3] Conversation Messages
    ├─ Summary: None
    ├─ Recent messages: 6
    └─ Total messages: 6

[4] Special Context Injections
    ├─ [TOOL MEMORY SUMMARY] Session tool history injected

[5] Token Budget
    ├─ Estimated total: 4523 tokens
    ├─ Cached tokens: 2100 (46.4% of total)
    └─ Uncached tokens: 4523
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### `formatToolUsageAnalysis(toolCalls, toolMemoryState)`

Analyzes tool usage patterns to identify potential misuse:

```
────────────────────────────────────────────────────────────────────────────────
🔍 TOOL USAGE ANALYSIS
────────────────────────────────────────────────────────────────────────────────

query_tool_memory Usage:
  ├─ Call #1
  │  ├─ Args:
  │  │  • filter_tool: kb_search
  │  └─ Result: Found 0 calls
  │
  │  Context at this turn:
  │  • Tool memory had 0 recorded calls
  │  ✗ Issue: Tool memory was EMPTY - no prior tool calls to query!
  │    This call should NOT have been made.

Potential Redundancy:
  ├─ kb_search called 2 times
  │  1. "neural networks" (position 2)
  │  2. "AI projects" (position 4)
  │  ✗ Agent did NOT check tool memory before repeat calls
────────────────────────────────────────────────────────────────────────────────
```

### 3. Verbose Mode (`scripts/text-agent-test.js`)

Added `--verbose` flag to toggle detailed output:

**Usage:**
```bash
# Non-interactive with verbose output
node scripts/text-agent-test.js --non-interactive --verbose

# Interactive with verbose output
node scripts/text-agent-test.js --interactive --verbose

# Default (compact output)
node scripts/text-agent-test.js --non-interactive
```

When verbose mode is **OFF** (default):
- Shows compact context stack summary
- Shows tool calls and results
- Omits detailed breakdown and analysis

When verbose mode is **ON**:
- Shows compact summary PLUS detailed context composition
- Shows tool usage analysis with misuse detection
- Helps debug why tools are being called incorrectly

## Key Insights for Debugging

### Understanding query_tool_memory Misuse

The enhanced output reveals:

1. **Was tool memory empty?** - If the agent calls `query_tool_memory` when `totalCalls: 0`, it's a misuse
2. **What tools were available?** - Shows if the agent had access to the right tools
3. **What was in context?** - Reveals if the tool memory summary was injected properly
4. **Pattern analysis** - Detects redundant searches without memory checks

### Example Debug Session

**Scenario:** Agent calls `query_tool_memory` on first turn (when memory is empty)

**Verbose output shows:**
```
[2] Tool Memory Context
    └─ Status: Empty (no tools executed yet)

...

query_tool_memory Usage:
  ├─ Call #1
  │  ├─ Args: filter_tool: kb_search
  │  └─ Result: Found 0 calls
  │
  │  Context at this turn:
  │  • Tool memory had 0 recorded calls
  │  ✗ Issue: Tool memory was EMPTY - no prior tool calls to query!
  │    This call should NOT have been made.
```

**Diagnosis:** The agent doesn't understand that `query_tool_memory` is only useful AFTER making tool calls. The tool guide needs to emphasize this more clearly.

### Example Good Usage

**Scenario:** Agent makes two searches, then checks memory

**Verbose output shows:**
```
[2] Tool Memory Context
    ├─ Status: Active
    ├─ Total calls recorded: 2
    ├─ Calls with full responses: 2
    └─ By tool:
       • kb_search: 2 calls

...

query_tool_memory Usage:
  ├─ Call #3
  │  ├─ Args: filter_tool: kb_search
  │  └─ Result: Found 2 calls
  │
  │  Context at this turn:
  │  • Tool memory had 2 recorded calls
  │  ✓ Valid use: Querying past kb_search calls
```

**Diagnosis:** Correct usage! Agent is reusing prior search results.

## Files Modified

1. `/app/api/chat/route.ts` - Enhanced observability data collection
2. `/scripts/text-agent-test-formatter.js` - Added detailed formatters
3. `/scripts/text-agent-test.js` - Integrated verbose mode and new formatters

## Next Steps for Improvement

Based on verbose output analysis, consider:

1. **Update tool guides** - If agents consistently misuse tools, the guide needs clarification
2. **System prompt adjustments** - Add explicit instructions about tool memory timing
3. **Context injection** - Verify tool memory summary is being injected properly
4. **Loop detection** - Ensure loop detector catches redundant searches

## Testing

Run the enhanced test script:

```bash
# Start dev server first
npm run dev

# In another terminal, run verbose tests
node scripts/text-agent-test.js --non-interactive --verbose
```

Review the detailed context breakdowns and tool usage analysis to identify patterns in agent behavior.
