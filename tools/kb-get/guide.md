# kb_get

Direct ID-based retrieval of KB entities. Returns complete document with all content and metadata. Faster than kb_search when exact entity ID is known.

## Parameters

- **id** (required): Exact entity ID in format "type:name" (e.g., "person:andrei_clodius")
  - Must be lowercase
  - Pattern: `^[a-z_]+:[a-z0-9_]+$`
  - Length: 3-100 chars

## Examples

**Retrieve person entity:**
```json
{
  "id": "person:andrei_clodius"
}
```
Returns full document with complete content from all chunks.

**Retrieve project entity:**
```json
{
  "id": "project:vector_watch_project"
}
```
Returns complete project documentation.

**Entity not found:**
```json
{
  "id": "person:nonexistent"
}
```
Returns error with `ok: false` and `type: "PERMANENT"` (not retryable).

## Watch Out

- **Use kb_search first**: Don't guess IDs. Use `kb_search` to discover entity IDs, then use `kb_get` for full content.
- **Exact ID required**: Must be exact match, case-sensitive (always lowercase). "Person:John" won't work.
- **ID format matters**: Must follow "type:name" pattern (snake_case). Display names won't work.
- **Full content returned**: Unlike `kb_search` snippets, `kb_get` returns ALL content (can be long).
- **Don't retry PERMANENT errors**: If ID doesn't exist, error is permanent. Use `kb_search` to find correct ID.
