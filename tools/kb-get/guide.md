# kb_get

Direct ID-based retrieval of KB entities. Returns complete document with all content and metadata. Faster than kb_search when exact entity ID is known.

## Parameters

- **id** (required): Exact entity ID in format "type:name" (e.g., "person:andrei_clodius")
  - Must be lowercase
  - Pattern: `^[a-z_]+:[a-z0-9_]+$`
  - Length: 3-100 chars
- **include_image_data** (optional): Include base64 pixel data for multimodal analysis (default: false)
  - **Use ONLY for visual assets** (photo, diagram, gif) when you need to analyze the actual pixels
  - Enables accurate description of colors, text, layouts, UI elements
  - **DO NOT use** if you just want to display the image (use `metadata.markdown` from kb_search instead)
  - Text mode only (automatically disabled in voice mode)

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

**Example: Fetch image for multimodal analysis**
```json
{
  "id": "asset:clipboard_ai_first_001",
  "include_image_data": true
}
```
Returns the asset WITH base64 image data in `_imageData` field for pixel-level analysis.

**Example: Just get metadata**
```json
{
  "id": "asset:clipboard_ai_first_001"
}
```
Returns asset metadata and markdown link WITHOUT pixel data (faster, cheaper).

## Visual Asset Analysis

**When to use include_image_data:**
- User asks "What does this image show/depict?"
- User asks about specific visual details (colors, text, layout)
- You need to verify or correct visual information

## Watch Out

- **Use kb_search first**: Don't guess IDs. Use `kb_search` to discover entity IDs, then use `kb_get` for full content.
- **Exact ID required**: Must be exact match, case-sensitive (always lowercase). "Person:John" won't work.
- **ID format matters**: Must follow "type:name" pattern (snake_case). Display names won't work.
- **Full content returned**: Unlike `kb_search` snippets, `kb_get` returns ALL content (can be long).
- **Don't retry PERMANENT errors**: If ID doesn't exist, error is permanent. Use `kb_search` to find correct ID.
