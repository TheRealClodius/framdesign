# ARCHITECTURE.md - FRAM Reference Documentation

Detailed architecture, internals, and project history for the FRAM dual-agent system. For action-oriented coding guidance, see `CLAUDE.md`.

## Project Overview

**FRAM** is a dual-agent conversational AI system providing text and voice interfaces for accessing a curated knowledge base about people, labs, and design projects. The system features advanced context management, multimodal capabilities (text + image analysis), and has been extensively tested and optimized for production use.

- **Repository**: TheRealClodius/framdesign
- **Node Version**: 24.1 (see `.nvmrc`)
- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript 5 + JavaScript (ES modules)

## Technology Stack

### Core
- **Frontend**: Next.js 16.1.1, React 19.2.3, Tailwind CSS 4
- **Backend**: Node.js 24.x, Next.js API routes, Express (voice server)
- **AI/LLM**: Google Gemini 2.5 Flash & Gemini 2.5 Flash Lite (text), Gemini Live API (voice)
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
  prompt-loader.ts      # System prompt loading with context injection
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
    /utils              # Core utilities
      similarity.js     # Tool deduplication with boolean parameter support
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
    core.md             # Simplified voice agent prompt

/kb                     # Knowledge base content
  /people               # Person markdown files (3 profiles: Andrei, Fram, Francesco)
  /lab                  # Organization markdown files
  /project              # Project markdown files (14 projects)
  /assets               # Embedded media
    manifest.json       # Asset metadata with GCS blob IDs (616 lines)

/scripts                # Utility scripts
  /Embed                # KB embedding scripts
  /Testing              # Test scripts
  /Deployment           # Deployment scripts
  text-agent-test.js    # Comprehensive agent testing (19 test questions)
  text-agent-test-formatter.js # Test output formatting

/prompts                # Text agent system prompts
  core.md               # Core personality with simplified retrieval guidance
  README.md             # Prompt architecture documentation

/tests                  # Jest test suite
  context-stack.test.ts # Context management tests
  /e2e                  # End-to-end tests
  /fixtures             # Test fixtures

/docs                   # Technical documentation
  AGENT_BEHAVIOR_ANALYSIS.md # Comprehensive 9-run test analysis (1600+ lines)
  GCS_MIGRATION_STATUS.md # Asset migration documentation
```

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
        │ Gemini 2.5  │  │ Gemini Live API  │
        │ Flash       │  │ (2.5 Flash       │
        │ (Text)      │  │  Native Audio)   │
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
Call Gemini 2.5 Flash API (streaming)
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
Return ToolResponse { ok, data?, error?, intents?, meta? }
```

## Tool System

### Available Tools (7 total)
1. `kb_search` - Semantic search over people, labs, projects, visual assets (retrieval, text+voice)
2. `kb_get` - Direct entity lookup by exact ID (retrieval, text+voice)
3. `perplexity_search` - External web search with citations (retrieval, text+voice)
4. `query_tool_memory` - Query past tool executions in session (utility, text+voice)
5. `ignore_user` - Block disrespectful users (action, text+voice)
6. `start_voice_session` - Switch to voice mode (action, text-only)
7. `end_voice_session` - Exit voice mode (action, voice-only)

### Tool System Architecture
- **Build-time compilation**: Tools discovered and validated at build (`tools/_build/tool-builder.js`)
- **Canonical schema**: JSON Schema 2020-12 with provider adapters (OpenAI + Gemini Native)
- **Response envelope**: Formal `ToolResponse` with error types and intents
- **Location**: `tools/tool_registry.json` (generated, gitignored)
- **Deduplication**: Smart similarity detection including boolean/numeric parameters (`tools/_core/utils/similarity.js`)
- **Loop detection**: Prevents infinite tool calls (`tools/_core/loop-detector.js`)

### Key Tool Infrastructure Modules
- `tools/_core/registry.js` - Tool loading, validation, and execution
- `tools/_core/state-controller.js` - Session state management
- `tools/_core/error-types.js` - Error handling with `ErrorType` enum and `ToolError` class
- `tools/_core/tool-response.js` - Response schema validation
- `tools/_core/metrics.js` - Performance tracking per session/turn
- `tools/_core/loop-detector.js` - Infinite loop prevention
- `tools/_core/tool-memory-store.js` - Full response storage
- `tools/_core/tool-memory-dedup.js` - Pre-execution duplicate detection
- `tools/_build/tool-builder.js` - Build artifact generator
- `tools/_build/watch-tools.js` - Dev file watcher with debounce

## Tool Memory Architecture

The system always retains full tool outputs, giving agents summaries in context while allowing on-demand access to complete data.

**Core Principle**: Full tool outputs are always stored. Agents see summaries in context but can retrieve full outputs anytime via `query_tool_memory`.

### Server-Side: In-Memory Tool Memory Store (`tools/_core/tool-memory-store.js`)
- Session-scoped storage keeps full responses for ALL calls in the sliding window
- **Window Policy**:
  - Last 50 calls: Full responses always retained
  - Auto-expires after 1 hour (`MAX_AGE_MS`)
  - Calls beyond 50 are dropped (oldest first)
- Full responses always retrievable via `getFullResponse(sessionId, callId)`
- Duplicate detection via similarity matching (85% threshold)

### Server-Side: Deduplication (`tools/_core/tool-memory-dedup.js`)
- Pre-execution duplicate detection for retrieval tools
- Returns cached full results when similarity >= 85%
- Prevents redundant expensive operations (KB searches, entity lookups)

### Client-Side: localStorage Persistence (`lib/storage.ts`)
- Conversation messages store full structured tool data:
  - `toolCalls[]`: Array of `{id, name, args}` for each tool invocation
  - `toolResults[]`: Array of `{callId, name, result}` with full structured results
- Enables accurate conversation reconstruction across page reloads

### Agent Access: query_tool_memory Tool (`tools/query-tool-memory/`)
- `get_full_response_for`: Retrieve complete tool output for any call_id
- Query with filters: toolId, timeRange, includeErrors
- Full responses available for all 50 calls in the window

## Message Context Management

- **Context Stack**: Structured message management with timestamps and date ranges
- Keep last 20 raw messages with automatic timestamping
- Auto-summarize when context exceeds limits with date range headers
- Token estimation: ~1 token per 4 characters
- Conversation hashing for Gemini prompt caching (70-83% cache efficiency)
- Smart deduplication prevents redundant tool calls
- Fallback system ensures no empty responses

## Knowledge Base

- Markdown files with YAML frontmatter in `/kb`
- Chunked and embedded to Qdrant (1000 chars, 200 overlap)
- Semantic search via vector similarity
- Schemas: `person`, `lab`, `project`
- **Current content**: 3 people, 14 projects, 100+ assets
- Assets stored in Google Cloud Storage (GCS) with signed URLs via `/api/refresh-asset-url`
- Complete manifest in `kb/assets/manifest.json` with blob_id mappings

## Deployment

### Vercel (Text Agent)
- Auto-deploys from main branch
- Serverless functions for API routes
- Config: `vercel.json` → `"buildCommand": "npm run build:tools && npm run build"`

### Railway (Voice Server)
- Deploys `/voice-server` directory
- Persistent container for WebSocket
- Config: `railway.json` → build: `npm run build:tools && cd voice-server && npm install`, start: `cd voice-server && npm start`
- Health check: `GET /health`

### Pre-deployment Checklist
1. `npm run lint` passes
2. `npm test` passes
3. `npm run build` succeeds
4. Environment variables configured
5. Tool registry rebuilt (`npm run build:tools`)

## Critical Constraints & Budgets

### Text Agent (Flexible)
- Max retrieval calls: 5 per turn
- Max total tool calls: 10 per turn
- Latency budget: Soft limit per tool (logs warning)
- Context window: Adaptive (message windowing enabled)
- Request timeout: 30 seconds

### Voice Agent (Strict - Latency Critical)
- Max retrieval calls: 2 per turn
- Max total tool calls: 3 per turn
- Retrieval latency budget: 800ms per call (soft)
- Action latency budget: 3s per call (soft)
- Loop detection: Prevents infinite retries

## External Dependencies

| Service | Purpose | Environment Variable |
|---------|---------|---------------------|
| Google Gemini API | Text completions, tool calling | `GEMINI_API_KEY` |
| Gemini Live API | Voice streaming, audio processing | `GEMINI_API_KEY` |
| Qdrant | Semantic search, KB indexing | `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY` |
| Google Cloud Storage | Image/asset storage | `GOOGLE_APPLICATION_CREDENTIALS` |
| Resend | Contact form delivery | `RESEND_API_KEY` |
| Perplexity | External web search | `PERPLEXITY_API_KEY` |
| Google Analytics | Usage tracking | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |

## Troubleshooting

**Tools not loading**: Run `npm run build:tools` to regenerate registry

**KB search returns nothing**: Verify embeddings with `npx tsx scripts/Embed/verify-kb-embedding.ts`

**Voice connection fails**: Check `NEXT_PUBLIC_VOICE_URL` and Railway status

**Build fails on native modules**: Tiktoken is externalized in `next.config.ts` via `serverExternalPackages`

**Slow dev server**: iCloud Drive handling in `next.config.ts` may need adjustment

**Image data not loading**: Ensure boolean parameters in tool calls are handled correctly by deduplication logic (`tools/_core/utils/similarity.js`)

**Empty agent responses**: Fallback system in `/api/chat/route.ts` prevents empty responses

**Tool memory errors**: Only query tool memory for actual call IDs from current session, not fabricated IDs

## Prompt Architecture

- **Simplified Approach**: Trust-based guidance over rigid decision trees
- **Core Philosophy**: "Simplification over specification" - trust the model's natural judgment
- **Retrieval Logic**: Simple 6-line guidance replaced complex 16-line flowchart (Run 8 improvement)
- **Result**: Better conversational understanding, no greeting misinterpretation issues

## Production Readiness

**Status**: PRODUCTION READY (as of Run 11 - January 30, 2026)

### Quality Metrics
- 100% success rate (20/20 test questions)
- 4.9s average response time
- 75.5% cache efficiency
- Zero hallucinations across all test runs
- Multimodal analysis fully functional
- External search working consistently
- Graceful error handling
- Smart tool usage (no loops or redundant calls)
- Tool memory full response persistence fixed and validated

## Recent Improvements & Changelog

### Context Stack Enhancement (Commit d42a684)
- Added timestamp formatting for messages
- Implemented date range extraction for summaries
- New test suite: `tests/context-stack.test.ts`

### Voice Agent Simplification (Commits 6555b92, 5c7b34a)
- Simplified prompt retrieval logic
- Fixed undefined context bug
- Applied "simplification over specification" principle

### Knowledge Base Expansion (Commit f9fa70d)
- Added Francesco Zurlo profile, new projects (Strategie del Design Book, That Language App, UiPath Studio Mobile, UrbanAir/Neobility)
- Updated asset organization and manifest (616 lines)

### Critical Bug Fixes (Documented in docs/AGENT_BEHAVIOR_ANALYSIS.md)
- **Run 7**: Empty response prevention, tool memory guidance, question batching
- **Run 5**: Image data caching (boolean params), perplexity search date context, KB re-embedding
- **Run 8**: Prompt simplification (16-line tree → 6-line guidance, 94.7% success)
- **Run 11**: 100% success rate, tool memory persistence validated

## Documentation Index

| Topic | Location |
|-------|----------|
| Action-oriented coding guide | `CLAUDE.md` |
| Tool authoring | `tools/README.md` |
| Cloud testing | `CLOUD.md` |
| KB schema | `kb/README.md` |
| Voice server | `voice-server/README.md` |
| Agent test results | `docs/AGENT_BEHAVIOR_ANALYSIS.md` |
| Prompt guidelines | `prompts/README.md` |
| Asset migration | `docs/GCS_MIGRATION_STATUS.md` |
