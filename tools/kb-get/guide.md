# kb_get

Direct ID-based retrieval from the knowledge base. Use when you already know the exact entity ID and want full content and metadata.

## Purpose

- **Fetch full content** for a known KB entity (person/lab/project/asset).
- **Avoid re-searching** when the ID is already available from a prior `kb_search`.

## When to Use

- You have an `id` already (often from a `kb_search` result).
- You need the **complete document**, not a snippet.
- You need **asset metadata** (and optionally pixel data) for deeper visual analysis.

## When NOT to Use

- You don’t know the exact ID → use `kb_search` first.
- You only want to **display** an image/video → prefer `kb_search` assets and paste `metadata.markdown`.
- You’re in **voice mode** and need pixel data → `include_image_data` is not available there.

## Parameters

 - **id** (required): Exact entity ID in `"type:name"` format (e.g. `"person:<id_from_kb_search>"`)
  - Lowercase
  - Pattern: `^[a-z_]+:[a-z0-9_]+$`
  - Length: 3–100 chars
- **include_image_data** (optional): Include base64 pixel data (default: false)
  - **Only for assets** when you must analyze pixels (layout, colors, visible text)
  - **Text mode only** (disabled in voice mode)

## Returns

- Full entity content + metadata.
- For assets, may include `_imageData` when `include_image_data: true`.

## Examples

**Get a person**
```json
{ "id": "person:<person_id_from_kb_search>" }
```

**Get a project**
```json
{ "id": "project:<project_id_from_kb_search>" }
```

**Asset metadata only (fast)**
```json
{ "id": "asset:<asset_id_from_kb_search>" }
```

**Asset pixel data (only when needed)**
```json
{
  "id": "asset:<asset_id_from_kb_search>",
  "include_image_data": true
}
```

## Pitfalls / Watch Out

- **Don’t guess IDs**: discover them via `kb_search`.
- **PERMANENT not-found**: don’t retry; search for the correct ID instead.
- **Full content can be long**: use selectively; don’t dump everything to the user.
