# kb_search

Semantic search over the Fram knowledge base (people, labs, projects, and visual assets). Use it to *discover* what exists and to pull in the most relevant evidence for a user’s question.

## Purpose

- **Discovery**: Find relevant KB entities when you don’t know the exact ID yet.
- **Curation**: Retrieve a small set of the most relevant items (and visuals) to support a narrative.

## When to Use

- **Fram/Andrei/project questions** where you need grounded facts from the KB.
- **Exploratory design discussions** where a concrete project or visual example would clarify the point.
- **Visual storytelling**: user asks for screenshots, diagrams, product photos, motion/video references.

## When NOT to Use

- **You already have the exact KB ID** → use `kb_get` instead (faster, complete content).
- **The user wants truly current information** (news, up-to-date stats) → use `perplexity_search`.
- **You’re about to “inventory dump” projects**: search only if you’ll surface a *small*, relevant set.

## Parameters

- **query** (required): Natural-language query (3–500 chars)
- **top_k** (optional): Number of results (default: 5, max: 10)
  - **Voice mode**: auto-clamps to **3** regardless of `top_k`
- **filters** (optional):
  - `type`: `"person" | "lab" | "project" | "photo" | "diagram" | "video" | "gif"`
  - `related_to`: Entity ID to filter by relationship (e.g., `"project:third_ear"`, `"person:andrei_clodius"`). Useful for finding all visuals associated with a specific project or person.
- **include_snippets** (optional): Include short text snippets (default: true)

## Returns

- A ranked list of results with `id`, `type`, `title`, `score`, and optional snippets.
- For **assets**, results include `metadata.markdown` (ready to paste into the response).

## Usage Patterns

- **KB-first for Fram facts**: use this before `perplexity_search` for anything Fram/Andrei/project-related.
- **Find → then fetch**: use `kb_search` to discover IDs, then `kb_get` for full detail.
- **Visuals as evidence**: 1 strong visual beats 5 generic ones; pick what supports the story.

## Examples

**Basic discovery**
```json
{ "query": "Project overview: <project name from user>" }
```

**Find visuals**
```json
{
  "query": "Interface screenshots for <project name from user>",
  "filters": { "type": "photo" }
}
```

**Narrow to people**
```json
{
  "query": "<topic or domain the user mentioned>",
  "filters": { "type": "person" },
  "top_k": 8
}
```

**Faster search (no snippets)**
```json
{ "query": "<Fram/Andrei/lab question>", "include_snippets": false }
```

**Find visuals for a specific project**
```json
{
  "query": "interface screenshots",
  "filters": { "related_to": "project:third_ear" },
  "top_k": 5
}
```

**Combine type and relationship filters**
```json
{
  "query": "demo videos",
  "filters": { "type": "video", "related_to": "project:vector_watch" }
}
```

## Using Asset Results

- **Always use `metadata.markdown`** for images/videos/diagrams/gifs.
- **Do not construct URLs manually**.

## Pitfalls / Watch Out

- **Empty results can be correct**: treat it as “no match”; reformulate query or adjust `filters`.
- **Snippets are short** (~200 chars): use `kb_get` if you need full content.
- **Filter logic is AND** (when multiple filters exist).
- **Skip generic-name fishing**: don’t search placeholder or contextless names; respond that the KB is scoped to Fram/Andrei’s work.