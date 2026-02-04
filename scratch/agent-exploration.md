# Agent Exploration Scratch Pad

## Notes
- (init) Starting exploration.

## Potential Issues / Questions
- (init) None yet.

## Notes
- AGENTS.md currently describes 5 tools, but `tools/` contains 7 tool directories and `tool_registry.json` lists more (e.g., `perplexity_search`, `query_tool_memory`).
- Text agent uses `gemini-2.5-flash` and does system + conversation caching (`ai.caches`) with fallback if unsupported. Uses tool memory (dedup, summarization, loop detection) and auto-chains `kb_get` after `kb_search` when user asks to show images.
- Voice server supports Vertex AI Live API auth (`VERTEXAI_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`) and falls back to Gemini API key for non-live flows; loads tool registry at startup with hot reload in dev.
- Tool registry is build-time artifact (`tools/tool_registry.json`) and runtime loader uses static import map for handlers in bundled environments.
- Embeddings use `gemini-embedding-001` (text-embedding-004 shutdown noted in code). Qdrant used for vector store.
- Blob storage supports `GCS_SERVICE_ACCOUNT_KEY`, `GCS_PROJECT_ID`, `GCS_BUCKET_NAME`, `GCS_KEY_FILE` and ADC.
- `/api/budget` endpoint exists for per-user token budget via `UsageService` (filesystem-based `.usage/user-tokens.json`).
- `voice-server/` prompts are separate from `prompts/` in root.

## Potential Issues / Questions
- Docs appear stale: `app/api/chat/INTEGRATION.md`, `voice-server/INTEGRATION.md`, `tools/ARCHITECTURE.md`, and `voice-server/README.md` still describe 5 tools and old Gemini model/schema conversion paths.
- `vector-search-api/` directory contains only `node_modules` (likely dead/leftover). Confirm if it should be removed or populated.
- `proxy.ts` exists but there is no `middleware.ts` or import path found; likely unused.
- `scripts/embed-kb.ts` header mentions LanceDB but implementation uses Qdrant.
- `tools/tool_registry.json` is present in repo while docs say generated artifact is gitignored.
- Additional doc mismatch: `USE_META_TOOLS` referenced in docs/tests but not used in `app/api/chat/route.ts` (possible dead config).
