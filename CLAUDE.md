# CLAUDE.md

FRAM: dual-agent conversational AI (text + voice) for a design knowledge base.
Next.js 16, React 19, TypeScript 5, Google Gemini 2.5, Qdrant, GCS.
Node 24 (.nvmrc). ES modules. Deployed: Vercel (text) + Railway (voice).

## Critical Rules

1. `tools/tool_registry.json` is gitignored and generated. Run `npm run build:tools` if missing. Agents crash without it.
2. Tool handlers are `.js` with relative imports and `.js` extensions. Everything else is TypeScript with `@/` path aliases.
3. `lib/config.ts`, `lib/prompt-loader.ts`, and anything importing `fs`/`path` are server-side only. Never import from client components.
4. Every tool handler returns `{ ok, data, intents, meta }`. Never return raw data.
5. ES modules everywhere (`import`/`export`). No `require()`. Only exception: `jest.config.cjs`.
6. `npm run build` auto-runs `build:tools` via prebuild hook. Don't remove this hook.
7. Qdrant is live-queried. No restart needed after re-embedding. But `npx tsx scripts/Embed/embed-kb.ts` IS required after KB content changes.
8. Two separate deployments sharing one tool system: Text agent → Vercel, Voice server → Railway.

## Decision Trees

### Where to put new code
- New AI capability → tool in `tools/{name}/` (handler.js + schema.json + guide.md)
- New page → `app/[locale]/`
- New API endpoint → `app/api/{name}/route.ts`
- New shared logic → `lib/services/{name}-service.ts` for domain services, `lib/{name}.ts` for utilities
- New React hook → `lib/hooks/{useName}.ts`
- New client utility → `lib/utils/{name}.ts`
- New React component → `components/{Name}.tsx` (PascalCase)

### After modifying code
- Changed tool schema/handler/guide → `npm run build:tools` → restart dev servers
- Changed KB content (`kb/**/*.md`) → `npx tsx scripts/Embed/embed-kb.ts` (no restart)
- Changed prompts (`prompts/*.md`) → restart dev servers (read at startup)
- Changed `lib/services/*` → run relevant tests → `npm run build`
- Changed `components/*` → nothing (hot-reload)
- Changed `next.config.ts` → restart dev server

### What to test
- After any change → `npm run lint && npm test`
- After tool changes → also `node scripts/text-agent-test.js --non-interactive`
- After KB changes → `npx tsx scripts/Testing/kb/test-search.ts`
- Before committing → `npm run lint && npm test && npm run build`

### Debugging
- Build fails on native modules → check `serverExternalPackages` in `next.config.ts`
- Tools not loading → `npm run build:tools`, verify `tools/tool_registry.json` exists
- KB search empty → `npx tsx scripts/Embed/verify-kb-embedding.ts`
- KB data integrity issues → `npm run kb:audit` (validates frontmatter, manifest, cross-refs, GCS, Qdrant)
- Empty agent responses → check fallback in `app/api/chat/route.ts`
- Broken images in agent responses → dead asset detection (`_dead: true` flag in tool responses, `_diagnostics.dead_assets` array)
- Tool failures at runtime → check tool events via `curl http://localhost:8080/metrics?events=true`
- Voice connection fails → check `NEXT_PUBLIC_VOICE_SERVER_URL` env var and Railway status

## Code Patterns

### New tool (`tools/{name}/handler.js`)
- Export `execute(context)` as named export
- Destructure: `const { args, capabilities, meta, session, clientId } = context`
- Success: `return { ok: true, data: {...}, intents: [], meta: { _timing: { total: Date.now() - start } } }`
- Errors: `throw new ToolError(ErrorType.PERMANENT, 'message', { retryable: false })`
- Imports: relative paths with `.js` ext → `import { ErrorType } from '../_core/error-types.js'`

### New tool schema (`tools/{name}/schema.json`)
- Required fields: `toolId` (snake_case), `version`, `category`, `description`, `parameters`
- Parameters: JSON Schema with `"additionalProperties": false` and `required` array
- Include: `sideEffects` ("read_only"|"write"|"destructive"), `idempotent`, `allowedModes` (["text","voice"]), `latencyBudgetMs`

### New API route (`app/api/{name}/route.ts`)
- Export named `POST` or `GET` async function
- Validate body: `const { field } = schema.parse(await request.json())`
- Success: `return NextResponse.json({ success: true, data: result })`
- Errors: `return handleServerError(error)` from `@/lib/errors`
- Imports: `@/` path aliases → `import { handleServerError } from "@/lib/errors"`

### New service (`lib/services/{name}-service.ts`)
- Lazy-load clients: `let client: Type | null = null` + private `getClient()`
- Export async functions (not classes)
- Throw enhanced error messages in catch blocks
- Check env vars in `getClient()`, throw if missing

### New test (`tests/{category}/{name}.test.ts`)
- Import from `@jest/globals`: `import { describe, test, expect } from '@jest/globals'`
- Nested `describe` blocks for organization
- Fixtures in `tests/fixtures/`
- File pattern: `*.test.ts` (or `*.test.js` for tool tests)
- Organized by category: `tests/features/`, `tests/services/`, `tests/tools/`, `tests/lib/`, `tests/e2e/`

### New component (`components/{Name}.tsx`)
- `"use client"` directive at top for client components
- Props interface above function
- Export as default function
- Tailwind CSS classes for all styling

## Dependency Chains

| If you change... | You must... |
|---|---|
| `tools/{name}/*.{js,json,md}` | `npm run build:tools` → restart dev servers |
| `kb/**/*.md` or `kb/assets/manifest.json` | `npx tsx scripts/Embed/embed-kb.ts` |
| `prompts/*.md` or `lib/config.ts` | Restart dev servers |
| `lib/services/*.ts` | `npm test` relevant tests → `npm run build` |
| `components/*.tsx` | Nothing (hot-reload) |
| `next.config.ts` | Restart dev server |

## Default Decisions

- **JS vs TS**: TypeScript always, except tool handlers (`.js`)
- **Error handling**: Tools use `ToolError` + `ErrorType`. API routes use `handleServerError()`. Services throw enhanced errors.
- **Validation**: Zod for API input. JSON Schema + ajv for tool schemas.
- **Styling**: Tailwind CSS v4 classes only. No CSS modules, no styled-components.
- **State**: React `useState`/`useEffect`. No Redux/Zustand. Server state via API calls.
- **Imports**: `@/` aliases in TypeScript. Relative with `.js` extension in tool JS files.
- **File naming**: PascalCase components, kebab-case everything else.
- **Branching**: Changes touching >3 files → create a branch.

## Commands

| Task | Command |
|---|---|
| Dev (all) | `npm run dev:all` |
| Dev (text only) | `npm run dev` |
| Dev (voice only) | `npm run dev:voice` |
| Build tools | `npm run build:tools` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Test all | `npm test` |
| Test specific | `npm test {name}` |
| Agent test | `node scripts/text-agent-test.js --non-interactive` |
| Test voice | `npm run test:voice` |
| Test watch | `npm run test:watch` |
| Embed KB | `npx tsx scripts/Embed/embed-kb.ts` |
| Verify KB | `npx tsx scripts/Embed/verify-kb-embedding.ts` |
| Test KB search | `npx tsx scripts/Testing/kb/test-search.ts` |
| KB health audit | `npm run kb:audit` |
| KB audit (fast) | `npm run kb:audit:fast` |

## Environment

Required in `.env`:
```
GEMINI_API_KEY                  # Google Gemini API
GEMINI_TEXT_MODEL                # Text agent model (default: gemini-3.1-flash-lite-preview)
GEMINI_VOICE_MODEL               # Voice agent model (default: gemini-3.1-flash-live-preview)
GEMINI_OBSERVABILITY_MODEL       # Observability topic analysis model (default: gemini-2.5-flash)
PERPLEXITY_API_KEY              # External search
QDRANT_CLUSTER_ENDPOINT         # Vector database URL
QDRANT_API_KEY                  # Vector database auth
GCS_BUCKET_NAME                 # Google Cloud Storage bucket
GCS_PROJECT_ID                  # GCS project ID
GCS_SERVICE_ACCOUNT_KEY         # Base64-encoded service account key (Vercel)
GOOGLE_APPLICATION_CREDENTIALS  # ADC or JSON credentials (local dev)
NEXT_PUBLIC_VOICE_SERVER_URL    # Voice server WebSocket URL
GA4_PROPERTY_ID                 # Google Analytics 4 property ID
VERCEL_TOKEN                    # Vercel API token (observability logs)
VERCEL_PROJECT_ID               # Vercel project ID (observability logs)
VERCEL_TEAM_ID                  # Vercel team ID (observability logs)
```

Voice server also needs its own `.env` in `voice-server/` with: `GEMINI_API_KEY`, `GEMINI_VOICE_MODEL`, `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY`, `ALLOWED_ORIGINS`.

## Reference

For detailed architecture, diagrams, tool memory internals, deployment configs, and project history, see `ARCHITECTURE.md`.
