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
- **`_allAssets`** (present when `filters.related_to` is used): A complete list of ALL matching assets with lightweight metadata (`id`, `type`, `title`). Use this for accurate counts and full awareness. To display any asset from `_allAssets`, call `kb_get` with that asset's ID.
- **`_assetHints`** on non-asset results: Shows the true total count of related assets (not capped by `top_k`).
- **`recommendation_candidates`**: Scored array of entities suitable for follow-up suggestions. Each has `id`, `title`, `type`, `rationale`, `score` (0-1 composite), and `asset_count`. Use the top 2 candidates by score for `<suggestions>`.

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

**Full asset awareness for a project**
```json
{
  "query": "all visuals",
  "filters": { "related_to": "project:desktop_agent_uipath" },
  "top_k": 5
}
```
Response includes `results` (top 5 with URLs/markdown) + `_allAssets` (complete list of all 19 assets with id/type/title). Use `kb_get` to fetch any specific asset from `_allAssets`.

## Using Asset Results

- **Always use `metadata.markdown`** for images/videos/diagrams/gifs.
- **Do not construct URLs manually**.

## Discovery Recipes

**Project deep dive** (user asks about a specific project):
1. `kb_search` with project name query
2. Note the project ID from results (e.g., `project:vector_watch`)
3. `kb_search` with `filters.related_to: "project:vector_watch"` for related assets
4. Pick 1-2 assets that support your narrative; include their `metadata.markdown`

**Domain exploration** (user mentions a design domain):
1. `kb_search` with domain query (e.g., "wearable design projects")
2. Present the most relevant project with context
3. If asset hints are available, fetch one representative visual

**Progressive disclosure** (user wants to see more):
1. `kb_search` with `related_to` filter for the current project → `_allAssets` gives you the full list
2. Refer to `_allAssets` for the complete inventory; use `kb_get` to fetch any asset not in `results`
3. Choose an asset showing a different aspect than what was already shown
4. If no more assets exist in `_allAssets`, suggest exploring a related project

**Accurate project asset counts** (user asks "how many images does X have?"):
1. `kb_search` with `related_to` filter → `_allAssets.length` is the true count
2. Report the count from `_allAssets`, not from `results.length` (which is capped by `top_k`)

## Pitfalls / Watch Out

- **Empty results can be correct**: treat it as “no match”; reformulate query or adjust `filters`.
- **Snippets are short** (~200 chars): use `kb_get` if you need full content.
- **Filter logic is AND** (when multiple filters exist).
- **Skip generic-name fishing**: don’t search placeholder or contextless names; respond that the KB is scoped to Fram/Andrei’s work.