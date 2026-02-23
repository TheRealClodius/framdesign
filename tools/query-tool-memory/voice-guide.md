# query_tool_memory

Query past tool executions in this conversation to avoid redundant calls and reuse information.

## When to Use

- **Before repeating a search**: Check if you already called kb_search or perplexity_search.
- **Follow-ups**: Reuse prior results instead of re-running tools.

## When NOT to Use

- **DO NOT** use to fetch KB entities (use kb_get).
- **DO NOT** use for initial searches (use kb_search or perplexity_search).
- **DO NOT** fabricate call_ids — only use IDs returned from a previous query.

## Key Parameters

- **filter_tool** (optional): Filter by tool ID (e.g. `"kb_search"`).
- **filter_time_range** (optional): `"last_turn"`, `"last_3_turns"`, or `"all"` (default).
- **get_full_response_for** (optional): Retrieve full response for a specific call_id.
- **include_errors** (optional): Include failed calls (default false).

## Usage

1. Call with `filter_tool` to see if a relevant search already exists.
2. If found, use `get_full_response_for` with the call_id to get full data.
3. Answer from cached data — no redundant tool call needed.

Memory lasts for this session only. Cleared on disconnect or after 1 hour of inactivity.
