# query_tool_memory

Query past tool executions in this conversation to avoid redundant calls and reuse information.

## When to Use

- **Before repeating a search**: Check if you already called kb_search or perplexity_search
- **Follow-ups**: Reuse prior results instead of re-running tools

## When NOT to Use

- **DO NOT** use this tool to fetch information about entities (use kb_get instead)
- **DO NOT** use this tool for initial searches (use kb_search or perplexity_search instead)
- **DO NOT** fabricate call_ids - only use call_ids that are returned from an initial query_tool_memory call
- **DO NOT** query for calls you haven't actually made in this conversation

## How It Works

Tool executions are stored during the conversation:
- **Recent calls** (last 10): Full responses available
- **Older calls** (next 40): Summaries only
- **Full responses**: Retrieve by call_id

## Example Workflow

```
User: "What's our neural networks project?"

Step 1: query_tool_memory(filter_tool='kb_search')
→ Response: Found 1 previous call
  - call_id: "call-abc123"
  - Turn 3: kb_search('neural networks')
  - Summary: "Found 3 projects related to ML"

Step 2: query_tool_memory(get_full_response_for='call-abc123')
→ Response: Full kb_search results with all project details

Step 3: Answer user using the cached data (no redundant kb_search!)
```

## Parameters

### filter_tool (optional)
Filter results by specific tool ID. Useful when you want to see only kb_search calls or only perplexity_search calls.

Example: `filter_tool='kb_search'`

### filter_time_range (optional)
Filter by recency:
- `'last_turn'`: Only tools called in the most recent turn
- `'last_3_turns'`: Recent history
- `'all'`: Entire conversation (default)

Example: `filter_time_range='last_3_turns'`

### include_errors (optional)
Include failed tool calls in results. Default is false (only successful calls).

Example: `include_errors=true`

### get_full_response_for (optional)
Retrieve the full response for a specific call. Use the call_id from initial query results.

Example: `get_full_response_for='call-abc123'`

## Response Format

### Query Response
```json
{
  "tool_calls": [
    {
      "call_id": "call-abc123",
      "tool": "kb_search",
      "args_summary": "query='neural networks'",
      "timestamp": 1234567890,
      "turn": 3,
      "summary": "Searched KB for 'neural networks'. Found 3 projects.",
      "success": true
    }
  ],
  "count": 1
}
```

### Full Response Retrieval
```json
{
  "full_response": {
    "ok": true,
    "data": {
      // Full tool response data
    }
  }
}
```

## Tips

- **Query first, then decide**: Check memory before calling expensive tools
- **Use call_id for details**: Summaries show what was found; full responses contain the data

## Memory Limits

Tool memory only lasts for this conversation session. It's cleared when:
- Session ends
- You disconnect
- After 1 hour of inactivity
