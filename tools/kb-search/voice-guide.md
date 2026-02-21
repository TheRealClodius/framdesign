# kb_search

Semantic search over the Fram knowledge base (people, labs, projects, and visual assets). Use it to discover what exists and pull relevant evidence for a user's question.

## When to Use

- **Fram/Andrei/project questions** — always check KB before answering.
- **Exploratory design discussions** — find a concrete project or visual to ground the point.
- **Visual storytelling** — find screenshots, diagrams, product photos, or videos.

## When NOT to Use

- **You already have the exact KB ID** → use `kb_get` instead.
- **User wants current information** (news, stats) → use `perplexity_search`.

## Key Parameters

- **query** (required): Natural-language query, 3–500 chars.
- **top_k** (optional): Results count (default 5, max 10). Voice mode auto-clamps to 3.
- **filters.type**: `"person"`, `"lab"`, `"project"`, `"photo"`, `"diagram"`, `"video"`, `"gif"`.
- **filters.related_to**: Entity ID to filter by relationship (e.g. `"project:third_ear"`).
- **include_snippets** (optional): Include text snippets (default true).

## Returns

Ranked results with `id`, `type`, `title`, `score`, and optional snippets. Asset results include `metadata.markdown` (ready to paste). When `related_to` is used, `_allAssets` gives the complete list of matching assets.

## Usage

- **KB-first for Fram facts**: always before `perplexity_search` for Fram/Andrei topics.
- **Find → then fetch**: discover IDs here, then `kb_get` for full detail.
- **Visuals as evidence**: 1 strong visual beats 5 generic ones.
- **Always use `metadata.markdown`** for images/videos — never construct URLs manually.
- **Empty results can be correct**: reformulate query or adjust filters.
