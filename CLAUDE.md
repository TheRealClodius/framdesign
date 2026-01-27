# CLAUDE.md - AI Assistant Guide

This document provides AI assistants with essential information for working effectively on the framdesign codebase.

## Project Overview

**FRAM** is a dual-agent conversational AI system featuring:
- **Text Agent**: Next.js 16 API routes with Google Gemini 3 Flash API (streaming)
- **Voice Agent**: WebSocket server with Google Gemini Live API (real-time audio)
- **Unified Tool System**: 5 tools shared between both agents
- **Knowledge Base**: Qdrant vector database with semantic search
- **Storage**: Google Cloud Storage for media assets

**Deployment**: Vercel (text agent + frontend) + Railway (voice server)

## Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | Next.js 16.1.1, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 |
| AI | Google Gemini API (`@google/genai` v1.35.0) |
| Vector DB | Qdrant Cloud (768-dim embeddings) |
| Storage | Google Cloud Storage |
| Email | Resend |
| Testing | Jest 29 |
| Node | 22.x (required) |

## Directory Structure

```
framdesign/
├── app/                      # Next.js app directory
│   ├── [locale]/             # i18n routing (next-intl)
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Main page (ChatInterface)
│   └── api/                  # API routes
│       ├── chat/route.ts     # Main text agent endpoint
│       ├── send/route.ts     # Contact form
│       ├── budget/route.ts   # Token budget checking
│       └── refresh-asset-url/ # GCS URL generation
│
├── components/               # React components
│   ├── ChatInterface.tsx     # Main chat UI
│   ├── MarkdownWithMermaid.tsx
│   └── Contact.tsx
│
├── lib/                      # Shared utilities & services
│   ├── config.ts             # App configuration
│   ├── constants.ts          # Constants (budgets, limits)
│   ├── token-count.ts        # Token estimation
│   ├── project-config.ts     # Portfolio data
│   └── services/             # Backend services
│       ├── chat-service.ts
│       ├── vector-store-service.ts
│       ├── blob-storage-service.ts
│       ├── embedding-service.ts
│       └── voice-service.ts
│
├── tools/                    # Unified tool system
│   ├── _core/                # Tool infrastructure
│   │   ├── registry.js       # Tool loading & execution
│   │   ├── state-controller.js
│   │   ├── error-types.js
│   │   ├── metrics.js
│   │   └── loop-detector.js
│   ├── _build/               # Build-time tooling
│   │   └── tool-builder.js   # Registry generator
│   ├── kb-search/            # Semantic search tool
│   ├── kb-get/               # Direct entity lookup
│   ├── ignore-user/          # User blocking
│   ├── start-voice-session/  # Voice mode activation
│   └── end-voice-session/    # Voice mode termination
│
├── voice-server/             # WebSocket server (Railway)
│   ├── server.js             # Main server
│   ├── providers/            # Gemini Live transport
│   ├── prompts/              # Voice-specific prompts
│   └── config.js
│
├── kb/                       # Knowledge base (Markdown)
│   ├── people/               # Person profiles
│   ├── project/              # Project descriptions
│   └── lab/                  # Lab/organization info
│
├── prompts/                  # Text agent system prompts
│   └── core.md               # Core personality
│
├── tests/                    # Test suite
│   ├── tools/                # Tool tests
│   ├── e2e/                  # End-to-end tests
│   └── services/             # Service tests
│
├── scripts/                  # Utility scripts
│   └── embed-kb.ts           # KB embedding script
│
└── docs/                     # Documentation
```

## Quick Start

```bash
# Install dependencies
npm install
cd voice-server && npm install && cd ..

# Build tool registry (REQUIRED before running)
npm run build:tools

# Development
npm run dev          # Text agent only (http://localhost:3000)
npm run dev:voice    # Voice server only (ws://localhost:8080)
npm run dev:all      # Both servers together
```

## NPM Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm run dev:all` | Start both text + voice servers |
| `npm run dev:voice` | Start voice server only |
| `npm run build:tools` | Generate tool registry (REQUIRED) |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm test` | Run Jest tests |
| `npm test:coverage` | Run tests with coverage |

## Validation Workflow (Before Committing)

**Always run in this order:**

```bash
# 1. Lint (MUST PASS)
npm run lint

# 2. Build tool registry (MUST PASS)
npm run build:tools

# 3. Run relevant tests
npm test -- --json --outputFile=test-results.json

# 4. Build verification (MUST PASS)
npm run build
```

## Test Targeting

Run tests based on what changed:

| Changed Files | Test Command |
|---------------|--------------|
| `tools/**` | `npm test tests/tools/` |
| `app/api/chat/**` | `npm test tests/e2e/` |
| `lib/services/**` | `npm test tests/services/` |
| `voice-server/**` | Manual testing required |
| `kb/**/*.md`, `docs/**` | No tests needed |

## Code Conventions

### TypeScript
- Strict mode enabled
- Path alias: `@/*` maps to project root
- Target: ES2017
- Module: ESNext with bundler resolution

### File Organization
- React components in `components/`
- API routes in `app/api/`
- Shared utilities in `lib/`
- Tools in `tools/{tool-name}/` (each with schema.json, guide.md, handler.js)

### Tool Development
Each tool requires 3 files:
1. `schema.json` - JSON Schema (draft 2020-12) with metadata
2. `guide.md` - Documentation and examples
3. `handler.js` - Execution logic with `execute(context)` function

After creating/modifying tools:
```bash
npm run build:tools  # Regenerate registry
# Restart dev servers
```

### Error Handling
- Use `ToolError` from `tools/_core/error-types.js` for tool errors
- Return structured `{ ok: boolean, data?, error?, intents? }` responses
- Domain failures return `ok: false`, unexpected failures throw `ToolError`

## Environment Variables

Required in `.env`:

```bash
# AI & Search
GEMINI_API_KEY=<google-ai-key>
PERPLEXITY_API_KEY=<optional>

# Google Cloud Storage
GCS_PROJECT_ID=<project-id>
GCS_BUCKET_NAME=<bucket-name>
GCS_SERVICE_ACCOUNT_KEY=<base64-credentials>
GOOGLE_APPLICATION_CREDENTIALS=<base64-credentials>

# Vector Database
QDRANT_CLUSTER_ENDPOINT=<qdrant-url>
QDRANT_API_KEY=<qdrant-key>

# Public URLs
NEXT_PUBLIC_VOICE_SERVER_URL=<wss://voice-server-url>
NEXT_PUBLIC_GA_MEASUREMENT_ID=<ga-id>
```

## Key APIs & Endpoints

### Text Agent
- `POST /api/chat` - Main chat with streaming
- `POST /api/send` - Contact form submission
- `GET /api/budget` - Token budget info
- `GET/POST /api/refresh-asset-url` - Asset URL generation

### Voice Server (WebSocket)
- WebSocket connection at configured URL
- `GET /health` - Health check

## Available Tools

| Tool | Category | Modes | Purpose |
|------|----------|-------|---------|
| `kb_search` | retrieval | text, voice | Semantic search over KB |
| `kb_get` | retrieval | text, voice | Direct entity lookup |
| `ignore_user` | action | text, voice | Block disrespectful users |
| `start_voice_session` | action | text only | Switch to voice mode |
| `end_voice_session` | action | voice only | End voice session |

## Constraints & Budgets

### Text Agent (Flexible)
- Max 5 retrieval calls per turn
- Max 10 total tool calls per turn
- 30-second request timeout

### Voice Agent (Strict - Latency Critical)
- Max 2 retrieval calls per turn
- Max 3 total tool calls per turn
- 800ms latency budget per retrieval
- Cannot use `start_voice_session`

## Common Tasks

### Adding a New Tool
1. Create `tools/{tool-name}/` directory
2. Add `schema.json`, `guide.md`, `handler.js`
3. Run `npm run build:tools`
4. Restart dev servers
5. Test with `npm test tests/tools/`

### Modifying Knowledge Base
1. Edit files in `kb/` (Markdown format)
2. Run embedding script: `npm run embed-kb` (if available)
3. No automated tests needed

### Updating System Prompts
1. Edit files in `prompts/` (text agent) or `voice-server/prompts/` (voice)
2. Restart dev servers
3. Test behavior manually

### Deploying Changes
- **Text Agent**: Push to main, Vercel auto-deploys
- **Voice Server**: Push to main, Railway auto-deploys

## Important Files

| File | Purpose |
|------|---------|
| `app/api/chat/route.ts` | Main text agent logic (~2600 lines) |
| `voice-server/server.js` | Voice WebSocket server (~1700 lines) |
| `tools/_core/registry.js` | Tool loading and execution |
| `lib/services/vector-store-service.ts` | Qdrant integration |
| `lib/services/blob-storage-service.ts` | GCS integration |
| `next.config.ts` | Next.js + Webpack config |
| `jest.config.cjs` | Test configuration |

## Architecture Principles

1. **Unified Tool System**: Both agents share the same tool registry
2. **Mode-Specific Constraints**: Voice has stricter latency budgets than text
3. **Service Separation**: Text (Vercel serverless) and Voice (Railway persistent) deploy independently
4. **Knowledge Base First**: Domain knowledge lives in `/kb/` as Markdown, indexed to Qdrant
5. **Build-Time Validation**: Tool registry validated during build, not runtime

## Documentation Links

| Topic | File |
|-------|------|
| Architecture overview | [AGENTS.md](AGENTS.md) |
| Testing guide | [CLOUD.md](CLOUD.md) |
| Tool system design | [tools/ARCHITECTURE.md](tools/ARCHITECTURE.md) |
| Tool authoring | [tools/README.md](tools/README.md) |
| Tool observability | [tools/OBSERVABILITY.md](tools/OBSERVABILITY.md) |
| Voice server setup | [voice-server/README.md](voice-server/README.md) |
| KB schema | [kb/README.md](kb/README.md) |
| Test coverage | [tests/TEST_SUMMARY.md](tests/TEST_SUMMARY.md) |

## Commit Message Format

```
<type>(<scope>): <description>

<body - what changed and why>

Tests: all passing
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
Scopes: `tools`, `api`, `lib`, `voice-server`, `kb`

## Troubleshooting

### Tool registry not found
```bash
npm run build:tools  # Regenerates tools/tool_registry.json
```

### Jest VM modules error
The `--experimental-vm-modules` flag is set in package.json test script.

### Build fails with TypeScript errors
- Check `tsconfig.json` excludes: `tools/**/*`, `voice-server/**/*`, `scripts/**/*`
- These directories use JavaScript, not TypeScript

### Voice server cannot be tested automatically
Manual testing required - see `voice-server/README.md`
