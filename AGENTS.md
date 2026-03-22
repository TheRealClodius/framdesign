# AGENTS.md

See `CLAUDE.md` for project overview, decision trees, code patterns, and command reference.

## Cursor Cloud specific instructions

### Services

| Service | Command | Port | Notes |
|---|---|---|---|
| Next.js (text agent) | `npm run dev` | 3000 | Main web app with chat UI and API |
| Voice server | `npm run dev:voice` | 8080 | WebSocket proxy for Gemini Live |
| Both + tool watcher | `npm run dev:all` | 3000 + 8080 | Runs concurrently via `concurrently` |

### Environment

- **Node.js 24** is required (`.nvmrc`). Use `nvm use 24` or `nvm install 24` if not active.
- **npm** is the package manager (two separate `package-lock.json`: root + `voice-server/`).
- **Tool registry** (`tools/tool_registry.json`) is gitignored and must be generated via `npm run build:tools` before starting dev servers. It runs automatically via the `prebuild` hook during `npm run build`.
- `.env` files are required in both `/` and `voice-server/`. Copy from `.env.example` and fill in API keys. The app starts with placeholder values but API-dependent features (chat, KB search) won't work without real keys.

### Required secrets for full functionality

`GEMINI_API_KEY`, `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY` are needed for chat and KB search. `GCS_BUCKET_NAME` and `GCS_PROJECT_ID` are needed for asset retrieval. See `CLAUDE.md` → Environment section for the full list.

### Testing

- `npm test` runs Jest. Many e2e/integration tests require live API keys (Gemini, Qdrant, GCS) and will fail without them. Unit tests (25 suites) pass without external services.
- `npm run lint` runs ESLint. The codebase has pre-existing lint warnings/errors.
- `npm run build` runs a full production build (includes `build:tools` via prebuild hook).

### Gotchas

- The Next.js build uses `--webpack` flag explicitly (not Turbopack) due to native module handling requirements.
- `tiktoken` is in `serverExternalPackages` in `next.config.ts` — if build fails on native modules, check that list.
- Tool handlers are `.js` files with relative imports and `.js` extensions — do not convert to TypeScript.
- The `dev:clean` script uses `pkill`; avoid running it in environments where process names might collide.
