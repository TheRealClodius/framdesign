# AGENTS.md

See `CLAUDE.md` for the full project guide: architecture, decision trees, code patterns, commands, and environment variables.

## Cursor Cloud specific instructions

### Node version
Node 24 is required (`.nvmrc`). Use `source /home/ubuntu/.nvm/nvm.sh && nvm use 24` before running any npm commands if the shell doesn't have it active by default.

### Quick start
1. `npm install` (root)
2. `cd voice-server && npm install` (if testing voice features)
3. `npm run build:tools` — generates `tools/tool_registry.json` (gitignored, required at runtime; agents crash without it)
4. `npm run dev` — starts Next.js dev server on port 3000

### Environment
- `.env` at root and `voice-server/.env` are required. Copy from `.env.example` files.
- **GCS credentials**: This project uses `GOOGLE_APPLICATION_CREDENTIALS` (a JSON string of GCP service account credentials) and `VERTEXAI_PROJECT` instead of `GCS_PROJECT_ID` / `GCS_SERVICE_ACCOUNT_KEY`. The codebase falls back from `GCS_PROJECT_ID` → `VERTEXAI_PROJECT` and from `GCS_SERVICE_ACCOUNT_KEY` → `GOOGLE_APPLICATION_CREDENTIALS` automatically (see `blob-storage-service.ts`, `message-log-service.ts`).
- `GCS_SERVICE_ACCOUNT_KEY` must be left **empty** (not `placeholder`) if not used, otherwise `npm run build` fails with a base64 decode error.
- The dev server and build succeed with placeholder API keys, but the chat AI features require a real `GEMINI_API_KEY`.

### Lint & tests
- `npm run lint` — runs ESLint. Pre-existing warnings/errors exist (mostly `no-explicit-any`, `no-unused-vars`). These are not regressions.
- `npm test` — runs Jest. ~25 of 45 test suites pass without real API keys. The failing tests are mostly e2e/integration tests that require live `GEMINI_API_KEY`, `QDRANT_*`, and `GCS_*` credentials. Unit tests pass.
- `npm run build` — production build (auto-runs `build:tools` via prebuild hook). Succeeds with placeholder env vars as long as `GCS_SERVICE_ACCOUNT_KEY` is empty.

### Services
| Service | Command | Port | Notes |
|---|---|---|---|
| Text agent (Next.js) | `npm run dev` | 3000 | Core frontend + API routes |
| Voice server | `npm run dev:voice` | 8080 | Optional; needs `voice-server/.env` |
| All (concurrent) | `npm run dev:all` | 3000, 8080 | Runs text + voice + tool watcher |

### UI testing
The site loads with the hero section in view. When manually or visually testing chat, **scroll down to the chat area first** so the relevant UI is in frame. That avoids repeated hero-only captures and saves context tokens.

### Gotchas
- No Docker or local databases needed — all external services (Qdrant, GCS, Gemini) are cloud-hosted.
- `tools/tool_registry.json` is gitignored and must be regenerated via `npm run build:tools` after cloning or after tool changes.
- The `prebuild` hook in `package.json` auto-runs `build:tools` before `npm run build`, but you must run it manually before `npm run dev`.
- When writing `.env` files from shell scripts, use literal values — not `${VAR}` shell expansion syntax inside single-quoted heredocs (`<< 'EOF'`). Shell variables inside `'EOF'` heredocs are not expanded and will be written as literal `${VAR}` strings, causing API auth failures at runtime.
- `GCS_PROJECT_ID` and `GCS_SERVICE_ACCOUNT_KEY` are not used in this deployment. Use `VERTEXAI_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS` (JSON string) instead. The codebase supports both credential paths.
- The KB embedding pipeline (`npx tsx scripts/Embed/embed-kb.ts`) needs `GEMINI_API_KEY`, `QDRANT_CLUSTER_ENDPOINT`, and `QDRANT_API_KEY`. It takes ~60s for all 23 KB files (243 chunks). Upserts are idempotent.
