# AGENTS.md - Architecture Guide for AI Agents

This document provides AI agents with a quick architectural overview of the framdesign repository to enable efficient work on tasks without extensive codebase exploration.

## Executive Summary

**FRAM** is a dual-agent conversational system featuring:
- **Text Agent**: Next.js API routes using Google Gemini 3 Flash API
- **Voice Agent**: WebSocket server using Google Gemini Live API
- **Unified Tool System**: Shared tool registry supporting both agents (5 tools)
- **Knowledge Base**: Qdrant vector database + Google Cloud Storage for assets
- **Deployment**: Vercel (text/frontend) + Railway (voice server)

**Technology Stack**: Next.js 16, Node.js 22, Google Gemini API, Qdrant, GCS, WebSocket

---

## Services Overview

### 1. Text Agent (Primary Frontend)

**Location**: [app/api/chat/route.ts](app/api/chat/route.ts)

- **Type**: HTTP API streaming endpoint
- **Port**: 3000 (development)
- **Technology**: Next.js 16, Google Gemini 3 Flash API
- **Deployment**: Vercel (serverless functions)
- **Key Features**:
  - Streaming text responses
  - Tool calling (5 tools available)
  - Message windowing & automatic summarization
  - Token estimation & budget enforcement
  - Up to 5 retrieval calls per turn (flexible)

**Key Endpoints**:
- `POST /api/chat` - Main chat endpoint with streaming
- `POST /api/send` - Contact form email submission
- `GET/POST /api/refresh-asset-url` - Asset URL generation
- `GET /api/debug-env` - Environment debugging

### 2. Voice Agent (WebSocket Server)

**Location**: [voice-server/server.js](voice-server/server.js)

- **Type**: WebSocket proxy for Gemini Live API
- **Port**: 8080 (development), Railway-assigned (production)
- **Technology**: Node.js, `@google/genai` SDK
- **Deployment**: Railway (persistent container)
- **Key Features**:
  - Real-time bidirectional audio streaming
  - Tool calling with strict latency budgets
  - Max 2 retrieval calls per turn (800ms each)
  - Max 3 total tool calls per turn
  - WebSocket protocol for client communication

**WebSocket Protocol**:
```javascript
// Client → Server messages
{ type: 'start', config: {...} }
{ type: 'audio', data: base64AudioData }
{ type: 'text', text: string }
{ type: 'stop' }

// Server → Client messages
{ type: 'connected' }
{ type: 'started', sessionId }
{ type: 'audio', data: base64AudioData }
{ type: 'text', text: string }
{ type: 'error', message: string }
```

### 3. Tool System (Shared Infrastructure)

**Location**: [tools/](tools/)

- **Type**: Unified tool registry and orchestration layer
- **Technologies**: JSON Schema (Draft 2020-12), Ajv validation
- **Available Tools** (5 total):
  1. `kb_search` - Semantic search (retrieval, text+voice)
  2. `kb_get` - Direct entity lookup (retrieval, text+voice)
  3. `ignore_user` - Block disrespectful users (action, text+voice)
  4. `start_voice_session` - Switch to voice mode (action, text-only)
  5. `end_voice_session` - Exit voice mode (action, voice-only)

**Key Modules**:
- [tools/_core/registry.js](tools/_core/registry.js) - Tool loading & execution
- [tools/_core/state-controller.js](tools/_core/state-controller.js) - Session state management
- [tools/_core/error-types.js](tools/_core/error-types.js) - Error handling & intents
- [tools/_core/metrics.js](tools/_core/metrics.js) - Performance tracking
- [tools/_core/loop-detector.js](tools/_core/loop-detector.js) - Infinite loop prevention
- [tools/_build/tool-builder.js](tools/_build/tool-builder.js) - Build artifact generator

### 4. Knowledge Base & Storage Services

**Location**: [lib/services/](lib/services/)

#### Vector Store Service
- **File**: [lib/services/vector-store-service.ts](lib/services/vector-store-service.ts)
- **Database**: Qdrant (cloud-hosted)
- **Functions**: `searchSimilar()`, `upsertDocuments()`, `deleteDocuments()`

#### Blob Storage Service
- **File**: [lib/services/blob-storage-service.ts](lib/services/blob-storage-service.ts)
- **Provider**: Google Cloud Storage (GCS)
- **Functions**: `uploadAsset()`, `resolveBlobUrl()`, `generateSignedUrl()`

#### Embedding Service
- **File**: [lib/services/embedding-service.ts](lib/services/embedding-service.ts)
- **Model**: Google Gemini embedding model (768-dimensional vectors)
- **Function**: `generateQueryEmbedding()`

#### Chat Service
- **File**: [lib/services/chat-service.ts](lib/services/chat-service.ts)
- **Provider**: Google Gemini API
- **Purpose**: Text completion requests with tool calling

#### Other Services
- [lib/services/usage-service.ts](lib/services/usage-service.ts) - User API consumption tracking
- [lib/services/contact-service.ts](lib/services/contact-service.ts) - Contact form via Resend
- [lib/services/voice-service.ts](lib/services/voice-service.ts) - Voice session management

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Clients                                  │
│              (Browser, Mobile, Desktop)                         │
└─────────────┬──────────────────────────┬──────────────────────┘
              │                          │
      ┌───────▼────────┐      ┌──────────▼─────────┐
      │  Text Agent    │      │  Voice Agent       │
      │  (Vercel)      │      │  (Railway)         │
      │  Port 3000     │      │  Port 8080 (WSS)   │
      │  Next.js API   │      │  WebSocket Server  │
      └───────┬────────┘      └──────────┬─────────┘
              │                          │
        HTTP POST              WebSocket (wss://)
              │                          │
              └───────────┬──────────────┘
                         │
        ┌────────────────▼─────────────────┐
        │   Unified Tool Registry          │
        │   (tools/_core)                  │
        │  • registry.js                   │
        │  • state-controller.js           │
        │  • error-types.js                │
        │  • metrics.js                    │
        │  • loop-detector.js              │
        └────────┬──────────────┬──────────┘
                 │              │
        ┌────────▼────┐  ┌──────▼───────────┐
        │ Gemini 3    │  │ Gemini Live API  │
        │ Flash API   │  │ (Streaming)      │
        │ (Text)      │  │ (Voice/Audio)    │
        └────────┬────┘  └──────┬───────────┘
                 │              │
                 └──────┬───────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼───┐  ┌───────▼────┐  ┌─────▼──────┐
    │ Qdrant │  │    GCS     │  │  Embedding │
    │(Vector)│  │ (Blob)     │  │  Service   │
    │  DB    │  │ Storage    │  │            │
    └────────┘  └────────────┘  └────────────┘
```

---

## Service Communication Flows

### Text Agent Chat Flow

```
User Query
    ↓
[Text Agent] POST /api/chat
    ↓
Load Tool Registry (first request only)
    ↓
Generate System Prompt + Tool Schemas
    ↓
Call Gemini 3 Flash API (streaming)
    ↓
Stream Response
    ├─ Tool call detected?
    │  ├─ Yes → Execute via toolRegistry.executeTool()
    │  │  ├─ kb_search/kb_get → Query Qdrant
    │  │  ├─ start_voice_session → Switch modes
    │  │  └─ ignore_user → Block user
    │  │
    │  └─ Return tool result to LLM
    │
    └─ Continue streaming final response
```

### Voice Agent Chat Flow

```
User Audio Input
    ↓
[Voice Server] WebSocket Connection
    ↓
Authenticate Origin (CORS check)
    ↓
Load Tool Registry (startup only)
    ↓
Send to Gemini Live API
    ↓
Process Audio/Text Stream
    ├─ Tool call detected?
    │  ├─ Yes → Check Latency Budgets
    │  │  ├─ Max 2 retrieval calls per turn
    │  │  ├─ Max 3 total calls per turn
    │  │  ├─ 800ms per retrieval (soft limit)
    │  │  └─ Execute via toolRegistry.executeTool()
    │  │
    │  └─ Return tool result to Gemini
    │
    └─ Generate Audio Response
```

### Tool Execution Flow

```
toolRegistry.executeTool(toolId, context)
    ↓
Load Handler: tools/{toolId}/handler.js
    ↓
Validate Parameters (Ajv against schema.json)
    ↓
Create Execution Context
    ├─ args: Validated parameters
    ├─ clientId: Session identifier
    ├─ ws: WebSocket (voice only)
    ├─ session: State snapshot
    └─ meta: Tool metadata
    ↓
Execute: handler.execute(context)
    ├─ kb_search → embedQuery → searchSimilar (Qdrant)
    ├─ kb_get → fetchEntity → resolveBlobUrl (GCS)
    ├─ ignore_user → setTimeout → WebSocket message
    ├─ start_voice_session → Mode switch
    └─ end_voice_session → Cleanup
    ↓
Return ToolResponse
{
  ok: boolean,
  data?: {...},
  error?: {...},
  intents?: [{type, value}],
  meta?: {...}
}
```

---

## Key Directories & Files

| Path | Purpose |
|------|---------|
| [app/[locale]/](app/[locale]/) | Frontend UI pages (Next.js) |
| [app/api/chat](app/api/chat) | Main text agent chat endpoint |
| [components/](components/) | React components for UI |
| [lib/config.ts](lib/config.ts) | Application configuration & prompts |
| [lib/constants.ts](lib/constants.ts) | Constants (budgets, limits, defaults) |
| [lib/services/](lib/services/) | Backend service wrappers |
| [lib/storage.ts](lib/storage.ts) | Client-side localStorage utilities |
| [lib/token-count.ts](lib/token-count.ts) | Token estimation logic |
| [kb/](kb/) | Knowledge base content (Markdown files) |
| [kb/people/](kb/people/) | Person profiles |
| [kb/project/](kb/project/) | Project descriptions |
| [kb/lab/](kb/lab/) | Lab/organization info |
| [kb/assets/](kb/assets/) | Images referenced in KB |
| [prompts/](prompts/) | System prompts & instructions |
| [prompts/core.md](prompts/core.md) | Core system prompt for text agent |
| [scripts/](scripts/) | Deployment & testing scripts |
| [scripts/embed-kb.ts](scripts/embed-kb.ts) | Index KB content to Qdrant |
| [tests/](tests/) | Test suites (unit, integration, E2E) |
| [tools/](tools/) | Unified tool system (5 tools) |
| [tools/_core/](tools/_core/) | Tool infrastructure |
| [tools/{toolName}/](tools/) | Individual tool implementations |
| [voice-server/](voice-server/) | WebSocket voice proxy server |
| [voice-server/server.js](voice-server/server.js) | Voice server entry point |
| [voice-server/providers/](voice-server/providers/) | Gemini Live transport layer |
| [vercel.json](vercel.json) | Vercel deployment configuration |
| [railway.json](railway.json) | Railway deployment configuration |
| [package.json](package.json) | Dependencies & npm scripts |

---

## External Dependencies

| Service | Type | Purpose | Environment Variable |
|---------|------|---------|---------------------|
| **Google Gemini API** | LLM | Text completions, tool calling | `GEMINI_API_KEY` |
| **Gemini Live API** | LLM | Voice streaming, audio processing | `GEMINI_API_KEY` |
| **Qdrant** | Vector DB | Semantic search, KB indexing | `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY` |
| **Google Cloud Storage** | Blob Storage | Image/asset storage | `GOOGLE_APPLICATION_CREDENTIALS` |
| **Resend** | Email Service | Contact form delivery | `RESEND_API_KEY` |
| **Google Analytics** | Analytics | Usage tracking | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |

### Required Environment Variables

**Text Agent (Vercel)**:
```bash
GEMINI_API_KEY=<google-ai-key>
GOOGLE_APPLICATION_CREDENTIALS=<base64-gcs-credentials>
QDRANT_CLUSTER_ENDPOINT=<qdrant-url>
QDRANT_API_KEY=<qdrant-api-key>
RESEND_API_KEY=<resend-key>
NEXT_PUBLIC_VOICE_SERVER_URL=<wss://voice-server-url>
NEXT_PUBLIC_GA_MEASUREMENT_ID=<ga-id>
USE_META_TOOLS=true
```

**Voice Server (Railway)**:
```bash
GEMINI_API_KEY=<google-ai-key>
QDRANT_CLUSTER_ENDPOINT=<qdrant-url>
QDRANT_API_KEY=<qdrant-api-key>
ALLOWED_ORIGINS=<comma-separated-origins>
```

---

## Development Setup

### Prerequisites
- **Node.js 22.x** (specified in [.nvmrc](.nvmrc) and [package.json](package.json))
- **npm** (included with Node.js)
- **Environment files**: `.env` in root and `voice-server/.env`

### Installation

```bash
# Install main app dependencies
npm install

# Install voice server dependencies (separate)
cd voice-server && npm install && cd ..

# Build tool registry (REQUIRED before running)
npm run build:tools
```

### Development Servers

```bash
# Text agent only (frontend + API)
npm run dev                      # http://localhost:3000

# Voice agent only (separate terminal)
npm run dev:voice                # ws://localhost:8080

# Both together (concurrent)
npm run dev:all
```

### Build & Validation

```bash
# Lint code (MUST PASS)
npm run lint

# Build tool registry (REQUIRED)
npm run build:tools

# Run tests
npm test -- --json --outputFile=test-results.json

# Build for production (MUST PASS)
npm run build
```

---

## Deployment Configuration

### Text Agent - Vercel

**Config**: [vercel.json](vercel.json)

```json
{
  "buildCommand": "npm run build:tools && npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

**Deployment Process**:
1. Build tool registry (`npm run build:tools`)
2. Build Next.js app (`npm run build`)
3. Deploy to Vercel (automatic HTTPS, CDN, serverless functions)

**URL**: Production URL set in Vercel dashboard

### Voice Server - Railway

**Config**: [railway.json](railway.json)

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build:tools && cd voice-server && npm install"
  },
  "deploy": {
    "startCommand": "cd voice-server && npm start",
    "healthcheckPath": "/health"
  }
}
```

**Deployment Process**:
1. Install all dependencies (root + voice-server)
2. Build tool registry (`npm run build:tools`)
3. Start WebSocket server on Railway-assigned port
4. Deploy with auto-scaling

**Health Check**: `GET /health` returns JSON status

---

## Testing & Validation

**See [CLOUD.md](CLOUD.md) for complete testing guide.**

### Quick Validation Workflow

```bash
# 1. Install dependencies
npm install

# 2. Lint (MUST PASS)
npm run lint

# 3. Build tool registry (MUST PASS)
npm run build:tools

# 4. Run tests
npm test -- --json --outputFile=test-results.json

# 5. Build verification (MUST PASS)
npm run build
```

### Smart Test Targeting

| Changed Files | Tests to Run |
|---------------|--------------|
| `tools/**` | `npm test tests/tools/` |
| `app/api/chat/**` | `npm test tests/e2e/text-agent*` |
| `lib/services/**` | `npm test tests/services/` |
| `voice-server/**` | **Manual testing required** |
| `kb/**/*.md`, `docs/**` | No tests needed |

### Quality Gates (Must Pass)
1. Lint: `npm run lint`
2. Tool registry build: `npm run build:tools`
3. Core tests: `npm test tests/tools/_core/`
4. Production build: `npm run build`

---

## Critical Constraints & Budgets

### Text Agent (Flexible)
- **Max retrieval calls**: 5 per turn
- **Max total tool calls**: 10 per turn
- **Latency budget**: Soft limit per tool (logs warning)
- **Context window**: Adaptive (message windowing enabled)
- **Request timeout**: 30 seconds

### Voice Agent (Strict - Latency Critical)
- **Max retrieval calls**: 2 per turn
- **Max total tool calls**: 3 per turn
- **Retrieval latency budget**: 800ms per call (soft)
- **Action latency budget**: 3s per call (soft)
- **Loop detection**: Prevents infinite retries
- **Restricted tools**: Cannot use `start_voice_session`

### Global Limits
- **Message history**: Configurable (automatic windowing)
- **Summarization trigger**: 60% of context window
- **Cache TTL**: 24 hours (Gemini API)
- **Tool execution timeout**: 2s (text), 500ms (voice)

---

## Quick Reference

### Common Commands

```bash
# Development
npm run dev                      # Start text agent dev server
npm run dev:voice                # Start voice server dev server
npm run dev:all                  # Start both servers concurrently

# Building
npm run build:tools              # Build tool registry (required!)
npm run build                    # Build Next.js app for production

# Testing
npm run lint                     # Lint code
npm test                         # Run all tests
npm test tests/tools/            # Test tool system only
npm test tests/e2e/              # Integration tests only

# Knowledge Base
npm run embed-kb                 # Re-index KB to Qdrant
npm run verify-kb                # Validate KB structure
```

### Critical Paths for Changes

**Tool Changes**:
1. Edit `tools/{tool-name}/` files
2. Run `npm run build:tools`
3. Restart agents (both text and voice)
4. Test: `npm test tests/tools/`

**Service Changes**:
1. Edit `lib/services/*.ts` files
2. Test: `npm test tests/services/`
3. Build: `npm run build`
4. Deploy

**API Changes**:
1. Edit `app/api/**/*.ts` files
2. Test: `npm test tests/e2e/`
3. Build: `npm run build`
4. Deploy to Vercel

**Voice Server Changes**:
1. Edit `voice-server/**/*.js` files
2. **Manual testing required** (no automated tests)
3. Deploy to Railway
4. See [voice-server/README.md](voice-server/README.md)

### Finding More Information

| Topic | Documentation |
|-------|---------------|
| Testing & validation workflow | [CLOUD.md](CLOUD.md) |
| Tool system architecture | [tools/ARCHITECTURE.md](tools/ARCHITECTURE.md) |
| Creating new tools | [tools/README.md](tools/README.md) |
| Tool metrics & observability | [tools/OBSERVABILITY.md](tools/OBSERVABILITY.md) |
| Voice server manual testing | [voice-server/README.md](voice-server/README.md) |
| Test coverage details | [tests/TEST_SUMMARY.md](tests/TEST_SUMMARY.md) |

---

## Decision Tree for Common Tasks

```
What task are you working on?
├── Adding/modifying a tool
│   └── Edit tools/{tool-name}/ → build:tools → restart agents → test
├── Changing text agent behavior
│   └── Edit app/api/chat/ → test e2e → build → deploy Vercel
├── Changing voice agent behavior
│   └── Edit voice-server/ → manual test → deploy Railway
├── Updating services (DB, storage, etc.)
│   └── Edit lib/services/ → test services → build → deploy both
├── Modifying knowledge base content
│   └── Edit kb/**/*.md → npm run embed-kb → verify search
├── Updating system prompts
│   └── Edit prompts/*.md → restart agents → test behavior
└── Documentation only
    └── Edit *.md files → no tests needed → commit
```

---

## Architecture Principles

1. **Unified Tool System**: Both agents share the same tool registry - changes apply to both
2. **Mode-Specific Constraints**: Voice has stricter latency budgets than text
3. **Service Separation**: Text (Vercel serverless) and Voice (Railway persistent) deploy independently
4. **Knowledge Base First**: All domain knowledge lives in `/kb/` as Markdown, indexed to Qdrant
5. **Build-Time Validation**: Tool registry built before deployment, validated at build time
6. **Fail-Safe Defaults**: Missing tools are gracefully skipped, missing KB entries return empty results

---

This document should serve as your quick reference when working on the framdesign codebase. For detailed procedures, always refer to the specific documentation files linked throughout.
