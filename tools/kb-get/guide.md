# kb_get

Direct ID-based retrieval of KB entities. Returns full content and metadata. Faster than kb_search when the ID is known.

## Parameters

- **id** (required): Exact entity ID in format "type:name" (e.g., "person:andrei_clodius")
  - Must be lowercase
  - Pattern: `^[a-z_]+:[a-z0-9_]+$`
  - Length: 3-100 chars
- **include_image_data** (optional): Include base64 pixel data for multimodal analysis (default: false)
  - **Use ONLY for visual assets** when you need to analyze pixels (colors, text, layout)
  - **DO NOT use** if you only want to display the image (use `metadata.markdown` from kb_search)
  - Text mode only (disabled in voice mode)

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

**Entity not found (permanent error):**
```json
{
  "id": "person:nonexistent"
}
```
Returns `ok: false` with `type: "PERMANENT"` (not retryable).

**Fetch image for multimodal analysis**
```json
{
  "id": "asset:clipboard_ai_first_001",
  "include_image_data": true
}
```
Returns the asset with base64 image data in `_imageData` for pixel analysis.

**Get metadata only**
```json
{
  "id": "asset:clipboard_ai_first_001"
}
```
Returns metadata and markdown link without pixel data (faster).

## Visual Asset Analysis

**When to use include_image_data:**
- User asks what an image shows or requests visual details
- You need to verify or correct visual information

## Watch Out

- **Use kb_search first**: Don't guess IDs. Use `kb_search` to discover entity IDs, then use `kb_get` for full content.
- **Exact ID required**: Must be exact match, case-sensitive (always lowercase). "Person:John" won't work.
- **ID format matters**: Must follow "type:name" pattern (snake_case). Display names won't work.
- **Full content returned**: Unlike `kb_search` snippets, `kb_get` returns ALL content (can be long).
- **Don't retry PERMANENT errors**: If ID doesn't exist, error is permanent. Use `kb_search` to find correct ID.
