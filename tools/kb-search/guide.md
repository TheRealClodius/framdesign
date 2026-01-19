# kb_search

Semantic search over knowledge base using natural language queries. Returns relevant people, labs, projects, and **visual assets** (photos, diagrams, videos, GIFs) with scores and citations. Voice mode auto-clamps to 3 results.

## Parameters

- **query** (required): Natural language search query (3-500 chars)
- **top_k** (optional): Number of results to return (default: 5, max: 10, voice mode: auto-clamps to 3)
- **filters** (optional): Filter results by type
  - `type`: Filter by entity type:
    - Documents: `"person"`, `"lab"`, `"project"`
    - Visual assets: `"photo"`, `"diagram"`, `"video"`, `"gif"`
- **include_snippets** (optional): Include text snippets in results (default: true)

## Examples

**Basic search:**
```json
{
  "query": "Who worked on Vector Watch?"
}
```
Returns top 5 results (or 3 in voice mode) with snippets and relevance scores.

**Search for images/visuals:**
```json
{
  "query": "Autopilot interface screenshots",
  "filters": { "type": "photo" }
}
```
Returns photo assets. Use the `metadata.markdown` field directly in your response - it contains the ready-to-use image markdown with correct URLs.

**Search for diagrams:**
```json
{
  "query": "context architecture diagram for Autopilot",
  "filters": { "type": "diagram" }
}
```
Returns diagram assets with pre-formatted markdown.

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

## Using Asset Results

When results include visual assets (photos, diagrams, videos, GIFs):
- **Always use `metadata.markdown`** - it contains pre-formatted markdown with correct GCS URLs
- **Do not construct image paths manually** - just copy the markdown field value
- For videos, the markdown contains an HTML video tag

Example response structure for an asset:
```json
{
  "id": "asset:autopilot_tool_calls_dark_001",
  "type": "photo",
  "title": "Autopilot Tool Calls - Dark Mode",
  "metadata": {
    "markdown": "![Autopilot Tool Calls - Dark Mode](https://storage.googleapis.com/...)",
    "url": "https://storage.googleapis.com/...",
    "caption": "Autopilot tool calls interface in dark mode"
  }
}
```
Simply include `metadata.markdown` in your response to display the image.

## Proactive Visual Search

When users ask about projects, **proactively search for images** to enrich your response:

1. **Project overview query**: `{ "query": "Autopilot interface overview", "filters": { "type": "photo" } }`
2. **Architecture/diagrams**: `{ "query": "Autopilot architecture", "filters": { "type": "diagram" } }`
3. **UI explorations**: `{ "query": "Autopilot component design", "filters": { "type": "photo" } }`

This helps you tell the project's story visually, not just verbally.

## Watch Out

- **Empty results is success**: If no matches found, returns `ok: true` with empty results array. Don't treat as error.
- **Voice mode clamping**: Results automatically clamped to max 3 in voice mode regardless of `top_k` parameter.
- **Snippet truncation**: Snippets are max 200 chars. Use `kb_get` to retrieve full document content.
- **Don't retry on empty**: Empty results are deterministic. Reformulate query or adjust filters instead of retrying.
- **Filter logic is AND**: Multiple filters are combined with AND logic (not OR).
- **Use kb_search for images first**: Before using perplexity_search for visuals, try kb_search - the knowledge base has extensive visual assets for all projects.
- **Show, don't just tell**: When discussing projects, search for and include relevant images. Users want to see the work.