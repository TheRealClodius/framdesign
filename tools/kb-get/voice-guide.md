# kb_get

Direct ID-based retrieval from the knowledge base. Use when you already know the exact entity ID and want full content.

## When to Use

- You have an `id` from a prior `kb_search` result.
- You need the **complete document**, not just a snippet.

## When NOT to Use

- You don't know the exact ID → use `kb_search` first.
- You only want to **display** an image/video → use `metadata.markdown` from `kb_search` results.

## Parameters

- **id** (required): Entity ID in `"type:name"` format (e.g. `"project:third_ear"`). Lowercase, pattern: `^[a-z_]+:[a-z0-9_]+$`.
- **include_image_data**: Not available in voice mode.

## Key Rules

- **Don't guess IDs** — discover them via `kb_search`.
- **Not-found is permanent** — don't retry; search for the correct ID instead.
- **Full content can be long** — use selectively, don't dump everything to the user.
