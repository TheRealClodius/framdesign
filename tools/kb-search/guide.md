# kb_search

Semantic search over knowledge base using natural language queries. Returns relevant people, labs, and projects with scores and citations. Voice mode auto-clamps to 3 results.

## Parameters

- **query** (required): Natural language search query (3-500 chars)
- **top_k** (optional): Number of results to return (default: 5, max: 10, voice mode: auto-clamps to 3)
- **filters** (optional): Filter results by type
  - `type`: Filter by entity type ("person", "lab", or "project")
- **include_snippets** (optional): Include text snippets in results (default: true)

## Examples

**Basic search:**
```json
{
  "query": "Who worked on Vector Watch?"
}
```
Returns top 5 results (or 3 in voice mode) with snippets and relevance scores.

**Filtered search:**
```json
{
  "query": "AI and machine learning expertise",
  "top_k": 8,
  "filters": { "type": "person" }
}
```
Returns up to 8 person entities matching the query.

**Without snippets:**
```json
{
  "query": "Vector Watch project",
  "include_snippets": false
}
```
Returns results without text snippets (faster, less verbose).

## Watch Out

- **Empty results is success**: If no matches found, returns `ok: true` with empty results array. Don't treat as error.
- **Voice mode clamping**: Results automatically clamped to max 3 in voice mode regardless of `top_k` parameter.
- **Snippet truncation**: Snippets are max 200 chars. Use `kb_get` to retrieve full document content.
- **Don't retry on empty**: Empty results are deterministic. Reformulate query or adjust filters instead of retrying.
- **Filter logic is AND**: Multiple filters are combined with AND logic (not OR).
