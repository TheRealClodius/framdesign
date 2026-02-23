# CLAUDE.md Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform CLAUDE.md from a 445-line reference encyclopedia into a ~250-line action-first field manual, moving reference material to ARCHITECTURE.md.

**Architecture:** Two-file split. CLAUDE.md becomes a playbook (what do I do?) with critical rules, decision trees, code patterns, and dependency chains. ARCHITECTURE.md becomes the reference (what exists?) with detailed descriptions, diagrams, history, and troubleshooting. Existing AGENTS.md content is consolidated into ARCHITECTURE.md to eliminate duplication.

**Tech Stack:** Markdown files only. No code changes.

---

### Task 1: Write the new CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (complete rewrite)

**Step 1: Write the new CLAUDE.md with action-first content**

Replace the entire file with this structure (~250 lines):

```markdown
# CLAUDE.md

FRAM: dual-agent conversational AI (text + voice) for a design knowledge base.
Next.js 16, React 19, TypeScript 5, Google Gemini 2.5, Qdrant, GCS.
Node 24.1 (.nvmrc). ES modules. Deployed: Vercel (text) + Railway (voice).

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
- Empty agent responses → check fallback in `app/api/chat/route.ts`
- Voice connection fails → check `NEXT_PUBLIC_VOICE_URL` env var and Railway status

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

### New test (`tests/{name}.test.ts`)
- Import from `@jest/globals`: `import { describe, test, expect } from '@jest/globals'`
- Nested `describe` blocks for organization
- Fixtures in `tests/fixtures/`
- File pattern: `*.test.ts`

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
- **Validation**: Zod for API input (`lib/schemas.ts`). JSON Schema + ajv for tool schemas.
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
| Embed KB | `npx tsx scripts/Embed/embed-kb.ts` |
| Verify KB | `npx tsx scripts/Embed/verify-kb-embedding.ts` |
| Test KB search | `npx tsx scripts/Testing/kb/test-search.ts` |

## Environment

Required in `.env`:
```
GEMINI_API_KEY             # Google Gemini API
PERPLEXITY_API_KEY         # External search
QDRANT_CLUSTER_ENDPOINT    # Vector database URL
QDRANT_API_KEY             # Vector database auth
GCS_BUCKET_NAME            # Google Cloud Storage
GCP_PROJECT_ID             # GCP project
RESEND_API_KEY             # Email service
NEXT_PUBLIC_VOICE_URL      # Voice server WebSocket URL
```

Voice server also needs its own `.env` in `voice-server/` with: `GEMINI_API_KEY`, `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY`, `ALLOWED_ORIGINS`.

## Reference

For detailed architecture, diagrams, tool memory internals, deployment configs, and project history, see `ARCHITECTURE.md`.
```

**Step 2: Verify the file reads correctly**

Run: `wc -l CLAUDE.md`
Expected: approximately 120-140 lines (the markdown above, with blank lines)

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "refactor: rewrite CLAUDE.md as action-first field manual

Move from 445-line reference encyclopedia to ~130-line
action-oriented playbook with critical rules, decision trees,
code patterns, dependency chains, and opinionated defaults."
```

---

### Task 2: Write ARCHITECTURE.md with reference material

**Files:**
- Create: `ARCHITECTURE.md` (root of repo)

**Step 1: Write ARCHITECTURE.md**

Consolidate reference material from the old CLAUDE.md and existing AGENTS.md into a single comprehensive reference document. Include:

1. **Project overview** (from old CLAUDE.md lines 1-27)
2. **Technology stack** (from old CLAUDE.md lines 14-26)
3. **Directory structure** (from old CLAUDE.md lines 28-109)
4. **Architecture diagram** (from AGENTS.md lines 124-168)
5. **Service communication flows** (from AGENTS.md lines 172-256)
6. **Tool system details** (from old CLAUDE.md lines 148-198 + AGENTS.md lines 72-91)
7. **Tool memory architecture** (from old CLAUDE.md lines 211-240)
8. **Message context management** (from old CLAUDE.md lines 169-176)
9. **Deployment configuration** (from AGENTS.md lines 380-424)
10. **Critical constraints & budgets** (from AGENTS.md lines 469-490)
11. **Troubleshooting** (from old CLAUDE.md lines 345-363)
12. **Production readiness & quality metrics** (from old CLAUDE.md lines 414-444)
13. **Recent improvements & changelog** (from old CLAUDE.md lines 365-412)
14. **Documentation index** (from old CLAUDE.md lines 322-329)

**Step 2: Verify completeness**

Manually diff: confirm every section from old CLAUDE.md and AGENTS.md is represented in either new CLAUDE.md or ARCHITECTURE.md. No information should be lost.

**Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: add ARCHITECTURE.md with consolidated reference material

Consolidates detailed architecture, diagrams, deployment configs,
tool memory internals, production metrics, and project history
from old CLAUDE.md and AGENTS.md into a single reference doc."
```

---

### Task 3: Update AGENTS.md to avoid duplication

**Files:**
- Modify: `AGENTS.md`

**Step 1: Slim down AGENTS.md**

Since ARCHITECTURE.md now contains the comprehensive reference, update AGENTS.md to be a thin redirect or remove duplicate content. Keep only agent-specific content that isn't in ARCHITECTURE.md (e.g., the decision tree for common tasks which is agent-workflow-specific).

Alternatively, if all content has been absorbed into ARCHITECTURE.md, replace AGENTS.md with a pointer:

```markdown
# AGENTS.md

For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).
For action-oriented coding guidance, see [CLAUDE.md](CLAUDE.md).
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: slim AGENTS.md, point to ARCHITECTURE.md and CLAUDE.md"
```

---

### Task 4: Verify the full system works

**Step 1: Run lint to make sure no markdown issues**

Run: `npm run lint`
Expected: PASS (lint doesn't check .md files, but good to verify nothing else broke)

**Step 2: Run tests to confirm nothing is affected**

Run: `npm test`
Expected: All tests pass (no code changes, only docs)

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (docs don't affect build, but confirm)

**Step 4: Commit verification note (if needed)**

No commit needed if all passes. If something fails, investigate - it would be unrelated to doc changes.
