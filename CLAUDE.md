# CLAUDE.md - AI Assistant Guide

Quick reference for AI assistants working on the FRAM codebase.

## Project Overview

**FRAM** is a dual-agent AI conversational system with text and voice modes:
- **Text Agent**: Next.js 16 API routes (Vercel) using Google Gemini 3 Flash
- **Voice Agent**: WebSocket server (Railway) using Google Gemini Live API
- **Unified Tool System**: 5 tools shared between both agents
- **Knowledge Base**: Qdrant vector database + Google Cloud Storage

**Stack**: Next.js 16, React 19, Node.js 22, TypeScript 5, Tailwind CSS 4, Google Gemini API

## Essential Commands

```bash
# Development
npm install                    # Install dependencies
npm run dev                    # Start text agent (localhost:3000)
npm run dev:voice              # Start voice server (localhost:8080)
npm run dev:all                # Start both concurrently

# Build & Validate (run in this order)
npm run lint                   # REQUIRED - must pass
npm run build:tools            # REQUIRED - generates tool registry
npm test                       # Run test suite
npm run build                  # REQUIRED - production build

# Targeted testing
npm test tests/tools/          # Tool system tests
npm test tests/e2e/            # Integration tests
npm test tests/services/       # Service tests
```

## Project Structure

```
framdesign/
├── app/                      # Next.js 16 app router
│   ├── [locale]/            # Frontend pages
│   └── api/                 # API routes
│       └── chat/            # Main chat endpoint
├── components/              # React UI components
├── lib/                     # Shared utilities
│   ├── services/            # Backend services (Qdrant, GCS, etc.)
│   ├── config.ts            # Prompt loading
│   └── constants.ts         # Global constants
├── tools/                   # Unified tool system
│   ├── _core/               # Tool infrastructure
│   ├── _build/              # Build-time tooling
│   └── {tool-name}/         # Individual tools (5 total)
├── voice-server/            # WebSocket voice server (separate package)
├── prompts/                 # Text mode system prompts
├── kb/                      # Knowledge base content (Markdown)
└── tests/                   # Test suites
```

## Key Files

| File | Purpose |
|------|---------|
| `app/api/chat/route.ts` | Main text agent endpoint |
| `voice-server/server.js` | Voice WebSocket server |
| `tools/_core/registry.js` | Tool loading & execution |
| `tools/tool_registry.json` | Build artifact (gitignored) |
| `lib/services/*.ts` | Backend service wrappers |
| `prompts/core.md` | Text agent personality |

## Tool System

**Available Tools** (5 total):
1. `kb_search` - Semantic search (text+voice)
2. `kb_get` - Direct entity lookup (text+voice)
3. `ignore_user` - Block users (text+voice)
4. `start_voice_session` - Switch to voice (text-only)
5. `end_voice_session` - Exit voice (voice-only)

**Tool Structure**:
```
tools/{tool-name}/
├── schema.json    # JSON Schema + metadata
├── guide.md       # User documentation
└── handler.js     # Execution logic
```

**After modifying tools**: Always run `npm run build:tools` to regenerate the registry.

## Code Conventions

### TypeScript
- Use path alias `@/` for imports (e.g., `import { service } from '@/lib/services/...'`)
- Strict mode enabled

### Tool Development
- Tools use JSON Schema (Draft 2020-12) for validation
- Return standardized `ToolResponse` envelope: `{ ok, data, error, intents, meta }`
- Handlers export `execute(context)` function

### Error Handling
- Use error types from `tools/_core/error-types.js`
- Retryable: `TRANSIENT`, `RATE_LIMIT`
- Non-retryable: `VALIDATION`, `NOT_FOUND`, `SESSION_INACTIVE`

### Testing
- Jest with Node environment
- Run `npm run build:tools` before tests
- Voice server requires manual testing (no automated tests)

## Constraints & Limits

### Text Agent (Flexible)
- Max 5 retrieval calls per turn
- Max 10 total tool calls per turn
- Request timeout: 30 seconds

### Voice Agent (Strict - Latency Critical)
- Max 2 retrieval calls per turn
- Max 3 total tool calls per turn
- 800ms per retrieval (soft limit)

## Workflow by Task Type

### Tool Changes
```bash
# 1. Edit tools/{tool-name}/ files
# 2. Rebuild registry
npm run build:tools
# 3. Test
npm test tests/tools/
# 4. Build
npm run build
```

### API/Service Changes
```bash
npm run lint
npm run build:tools
npm test tests/e2e/ tests/services/
npm run build
```

### Documentation Only
```bash
npm run lint  # Only lint needed
```

### Voice Server Changes
- Edit `voice-server/**/*.js`
- Manual testing required (see `voice-server/README.md`)
- Note in commit: "manual voice testing required"

## Environment Variables

**Required for Text Agent**:
```bash
GEMINI_API_KEY
QDRANT_CLUSTER_ENDPOINT
QDRANT_API_KEY
GCS_PROJECT_ID
GCS_BUCKET_NAME
GCS_SERVICE_ACCOUNT_KEY
```

**Required for Voice Server**:
```bash
GEMINI_API_KEY
QDRANT_CLUSTER_ENDPOINT
QDRANT_API_KEY
ALLOWED_ORIGINS
```

## Common Pitfalls

1. **Forgot to build tools**: Run `npm run build:tools` after any tool changes
2. **Voice server has no tests**: Manual testing required, note in commits
3. **Node version**: Must use Node.js 22.x (check `.nvmrc`)
4. **Tool registry is gitignored**: It's generated at build time, not committed

## Related Documentation

| Document | Content |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Full architecture guide |
| [CLOUD.md](CLOUD.md) | CI/CD testing workflow |
| [tools/ARCHITECTURE.md](tools/ARCHITECTURE.md) | Tool system design |
| [tools/README.md](tools/README.md) | Tool authoring guide |
| [voice-server/README.md](voice-server/README.md) | Voice server setup |
| [kb/README.md](kb/README.md) | Knowledge base schema |

## Quick Decision Tree

```
What are you changing?
├── tools/**           → build:tools → test tools/ → build
├── app/api/**         → lint → build:tools → test e2e/ → build
├── lib/services/**    → lint → build:tools → test services/ → build
├── voice-server/**    → Manual test only, note in commit
├── prompts/**         → Lint only, restart agents to apply
├── kb/**              → Lint only, re-embed if needed
└── docs/**, *.md      → Lint only
```
