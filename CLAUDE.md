# CLAUDE.md - Project Context for AI Assistants

This document provides essential context for Claude and other AI assistants working on the FRAM project.

## Project Overview

**FRAM** is a dual-agent conversational AI system providing text and voice interfaces for accessing a curated knowledge base about people, labs, and design projects.

- **Repository**: TheRealClodius/framdesign
- **Node Version**: 22.x (see `.nvmrc`)
- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript 5 + JavaScript (ES modules)

## Technology Stack

### Core
- **Frontend**: Next.js 16.1.1, React 19.2.3, Tailwind CSS 4
- **Backend**: Node.js 22.x, Next.js API routes, Express (voice server)
- **AI/LLM**: Google Gemini 3 Flash (text), Gemini Live API (voice)
- **Embeddings**: Google `gemini-embedding-001` (768 dimensions)

### Storage & Services
- **Vector Database**: Qdrant Cloud
- **Blob Storage**: Google Cloud Storage (GCS)
- **Email**: Resend
- **Deployment**: Vercel (text agent), Railway (voice server)

## Directory Structure

```
/app                    # Next.js application
  /[locale]             # Internationalized routes
  /api                  # API routes
    /chat/route.ts      # Main text agent endpoint (streaming)
    /send/route.ts      # Contact form
    /budget/route.ts    # Token budget tracking
    /refresh-asset-url/ # GCS signed URL generation

/lib                    # Shared utilities & services
  /services             # Domain services
    chat-service.ts     # Gemini API interactions
    embedding-service.ts # Text embedding generation
    vector-store-service.ts # Qdrant operations
    blob-storage-service.ts # GCS file operations
    voice-service.ts    # Voice session management
    usage-service.ts    # User API quota tracking
  config.ts             # Configuration loader
  prompt-loader.ts      # System prompt loading
  token-count.ts        # Token estimation
  schemas.ts            # Zod validation schemas
  errors.ts             # Error handling utilities

/components             # React components
  ChatInterface.tsx     # Main chat UI (89KB - core component)
  MarkdownWithMermaid.tsx # Markdown + diagrams
  MermaidRenderer.tsx   # Diagram rendering

/tools                  # Unified tool system
  /_core                # Runtime infrastructure
    registry.js         # Tool loading and execution
    state-controller.js # Session state management
    tool-response.js    # Response schema validation
    loop-detector.js    # Infinite loop prevention
    metrics.js          # Response metrics
  /_build               # Build-time infrastructure
    tool-builder.js     # Registry generation
    watch-tools.js      # Dev file watcher
  /kb-search            # Semantic KB search
  /kb-get               # Direct entity lookup
  /ignore-user          # Block users
  /start-voice-session  # Switch to voice mode
  /end-voice-session    # Exit voice mode
  /query-tool-memory    # Query session memory
  /perplexity-search    # External search

/voice-server           # WebSocket voice agent (Railway)
  server.js             # Gemini Live API proxy
  /prompts              # Voice system prompts

/kb                     # Knowledge base content
  /people               # Person markdown files
  /lab                  # Organization markdown files
  /project              # Project markdown files
  /assets               # Embedded media

/scripts                # Utility scripts
  /Embed                # KB embedding scripts
  /Testing              # Test scripts
  /Deployment           # Deployment scripts

/prompts                # Text agent system prompts
  core.md               # Core personality
  voice-behavior.md     # Voice-mode guidance

/tests                  # Jest test suite
/docs                   # Technical documentation
```

## Common Commands

### Development
```bash
npm run dev              # Start Next.js dev server (port 3000)
npm run dev:all          # Start frontend + voice + tools watcher
npm run dev:voice        # Start voice server only
npm run watch:tools      # Watch and rebuild tools
```

### Building
```bash
npm run build           # Production build (runs build:tools first)
npm run build:tools     # Generate tools/tool_registry.json
```

### Testing
```bash
npm test                # Run all tests
npm test -- --watch     # Watch mode
npm test -- --coverage  # Coverage report
npm run lint            # ESLint validation
```

### Knowledge Base
```bash
npx tsx scripts/Embed/embed-kb.ts           # Embed KB to Qdrant
npx tsx scripts/Embed/verify-kb-embedding.ts # Verify embeddings
npx tsx scripts/Testing/kb/test-search.ts    # Test KB search
```

## Architecture Patterns

### Dual-Agent System
- **Text Agent**: HTTP streaming via Next.js API routes → Vercel
- **Voice Agent**: WebSocket via standalone Node.js → Railway
- Both share the unified tool system

### Tool System
- **Build-time compilation**: Tools discovered and validated at build
- **Canonical schema**: JSON Schema 2020-12 with provider adapters
- **Response envelope**: Formal `ToolResponse` with error types and intents
- **Location**: `tools/tool_registry.json` (generated, gitignored)

### Knowledge Base
- Markdown files with YAML frontmatter in `/kb`
- Chunked and embedded to Qdrant (1000 chars, 200 overlap)
- Semantic search via vector similarity
- Schemas: `person`, `lab`, `project`

### Message Context Management
- Keep last 20 raw messages
- Auto-summarize when context exceeds limits
- Token estimation: ~1 token per 4 characters
- Conversation hashing for Gemini prompt caching

## Key Patterns & Conventions

### File Naming
- Components: PascalCase (`ChatInterface.tsx`)
- Services: kebab-case (`chat-service.ts`)
- Tools: kebab-case directories (`kb-search/`)
- Scripts: kebab-case (`embed-kb.ts`)

### Tool Development
Each tool requires:
- `index.js` - Tool implementation with `execute()` function
- `schema.json` - JSON Schema for parameters
- `guide.md` - Usage documentation

Tools must return `ToolResponse` objects via `createToolResponse()`.

### Error Handling
- Use error types from `tools/_core/error-types.js`
- Set appropriate `retryable` flags
- Include `userFacingMessage` for display

### State Management
- Session state via `state-controller.js`
- Tool memory via `tool-memory-store.js`
- Loop detection prevents infinite tool calls

## Environment Variables

Required in `.env`:
```
GEMINI_API_KEY=          # Google Gemini API
NEXT_PUBLIC_VOICE_URL=   # Voice server WebSocket URL
QDRANT_CLUSTER_ENDPOINT= # Qdrant vector database
QDRANT_API_KEY=          # Qdrant authentication
GCS_BUCKET_NAME=         # Google Cloud Storage bucket
GCP_PROJECT_ID=          # GCP project ID
RESEND_API_KEY=          # Email service
```

## Testing

### Test Categories
- **Unit tests**: Individual functions
- **Integration tests**: Component interactions
- **E2E tests**: Full conversation flows
- **Tool tests**: Registry and execution

### Running Specific Tests
```bash
npm test message-windowing    # Test message handling
npm test token-estimation     # Test token counting
npm test summarization        # Test summarization logic
```

## Deployment

### Vercel (Text Agent)
- Auto-deploys from main branch
- Serverless functions for API routes
- Uses `vercel.json` for configuration

### Railway (Voice Server)
- Deploys `/voice-server` directory
- Persistent container for WebSocket
- Uses `railway.json` for configuration

### Pre-deployment Checklist
1. `npm run lint` passes
2. `npm test` passes
3. `npm run build` succeeds
4. Environment variables configured

## Important Notes

### Performance
- Token budget tracking via `/api/budget`
- Loop detection prevents runaway tool calls
- Metrics collection in `tools/_core/metrics.js`

### Assets
- Stored in Google Cloud Storage
- Signed URLs generated on demand
- Migration status in `docs/GCS_MIGRATION_STATUS.md`

### Documentation Locations
- Tool authoring: `tools/README.md`
- Architecture: `AGENTS.md`
- Cloud testing: `CLOUD.md`
- KB schema: `kb/README.md`
- Voice server: `voice-server/README.md`

## Quick Reference

| Task | Command/Location |
|------|-----------------|
| Start development | `npm run dev:all` |
| Add a new tool | Create dir in `/tools`, add index.js + schema.json |
| Add KB content | Create markdown in `/kb/{type}/` |
| Embed KB changes | `npx tsx scripts/Embed/embed-kb.ts` |
| Check tool registry | `tools/tool_registry.json` |
| Debug API | `GET /api/debug-env` |
| View voice metrics | `GET /metrics` on voice server |

## Troubleshooting

### Common Issues

**Tools not loading**: Run `npm run build:tools` to regenerate registry

**KB search returns nothing**: Verify embeddings with `verify-kb-embedding.ts`

**Voice connection fails**: Check `NEXT_PUBLIC_VOICE_URL` and Railway status

**Build fails on native modules**: Tiktoken is externalized in `next.config.ts`

**Slow dev server**: iCloud Drive handling in `next.config.ts` may need adjustment
