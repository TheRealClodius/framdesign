# AGENTS.md - Architecture Guide for AI Agents

This document provides AI agents with a quick architectural overview of the framdesign repository to enable efficient work without extensive codebase exploration.

## Executive Summary

FRAM is a dual-agent conversational system with a shared tool registry, a Qdrant-backed knowledge base, and a WebSocket voice stack.

- Text agent: Next.js API routes streaming with Gemini 2.5 Flash, tool calling, system prompt caching, conversation caching, tool-memory dedup/summarization, and auto-chained asset retrieval.
- Voice agent: WebSocket server using Gemini Live (gemini-live-2.5-flash-native-audio) with strict tool budgets, session state control, and real-time audio streaming.
- Tool system: Build-time registry with canonical JSON Schema plus provider schemas; 7 tools (kb_search, kb_get, perplexity_search, query_tool_memory, ignore_user, start_voice_session, end_voice_session).
- Knowledge base: Markdown in `kb/`, embeddings via `gemini-embedding-001` (768 dims), Qdrant vector store, and GCS signed URLs for assets.
- Deployments: Vercel (text/front-end) + Railway (voice server).

Technology stack: Next.js 16, React 19, Node.js 24, @google/genai, Qdrant, GCS, WebSocket, Perplexity API, Resend.

---

## Services Overview

### 1. Text Agent (Primary Frontend)

Location: `app/api/chat/route.ts`

- Type: HTTP API streaming endpoint (Next.js 16)
- Port: 3000 (development)
- Model: `gemini-2.5-flash`
- Deployment: Vercel (serverless)
- Key behaviors:
- Streaming responses with status events (`---STATUS---` markers)
- Tool calling through shared registry (Gemini Native schemas)
- System prompt caching (Gemini caches) + conversation cache with TTL
- Message windowing and token budget enforcement (30k token target)
- Tool memory (dedup + summarization + loop detection)
- Auto-chain: `kb_search` -> `kb_get` for visual “show me” requests
- Optional web search via `perplexity_search` when KB is irrelevant
- Global user budget via `UsageService` (Upstash Redis when configured; filesystem fallback for local)

Key endpoints:
- `POST /api/chat` - main chat endpoint (streaming)
- `GET /api/budget` - per-user token budget status
- `POST /api/send` - contact form email submission
- `POST /api/refresh-asset-url` - refresh GCS signed URLs
- `GET /api/debug-env` - env presence diagnostics

### 2. Voice Agent (WebSocket Server)

Location: `voice-server/server.js`

- Type: WebSocket proxy for Gemini Live API
- Port: 8080 (development), Railway-assigned (production)
- Model: `gemini-live-2.5-flash-native-audio`
- Deployment: Railway (persistent container)
- Auth: Vertex AI preferred (`VERTEXAI_PROJECT` + credentials); AI Studio key fallback for non-live flows
- Key behaviors:
- Real-time bidirectional audio streaming
- Tool calling with strict latency budgets and hard gates
- Max 2 retrieval calls per turn, max 3 total tool calls per turn
- Loop detection for repeated tool calls
- Tool call start signal for client “thinking” sound (`tool_call_started`)
- Session state via shared state controller

WebSocket protocol (core messages):
- Client -> Server: `start`, `audio`, `text`, `stop`
- Server -> Client: `connected`, `started`, `audio`, `text`, `error`, `tool_call_started`

### 3. Tool System (Shared Infrastructure)

Location: `tools/`

- Build-time registry: `tools/_build/tool-builder.js` generates `tools/tool_registry.json`
- Runtime loader: `tools/_core/registry.js` loads registry + handlers
- Provider schemas: OpenAI + Gemini Native, no runtime conversion
- Handler loading: static import map for bundlers (update `HANDLER_IMPORTS` when adding tools)

Available tools (7):
- `kb_search` (retrieval): semantic search over KB
- `kb_get` (retrieval): fetch full entity by ID, optional `include_image_data`
- `perplexity_search` (retrieval): real-time web search via Perplexity API
- `query_tool_memory` (utility): query recent tool call history
- `ignore_user` (action): block abusive users
- `start_voice_session` (action, text-only): switch to voice mode
- `end_voice_session` (action, voice-only): end voice mode

Supporting modules:
- `tools/_core/tool-memory-store.js` - session-scoped tool memory
- `tools/_core/tool-memory-dedup.js` - pre-execution dedup (retrieval tools)
- `tools/_core/tool-memory-summarizer.js` - Gemini Flash Lite summaries
- `tools/_core/loop-detector.js` - prevents repeated tool loops
- `tools/_core/metrics.js` - in-memory execution metrics

### 4. Knowledge Base & Storage Services

Location: `lib/services/`

- Vector store: `vector-store-service.ts` (Qdrant, collection `kb_documents`)
- Embeddings: `embedding-service.ts` (Gemini `gemini-embedding-001`, 768 dims)
- Blob storage: `blob-storage-service.ts` (GCS signed URLs, optional LRU cache)
- Chat service: `chat-service.ts` (client-side streaming helper)
- Voice client: `voice-service.ts` (browser audio + WebSocket)

---

## Architecture Diagram (Simplified)

```
Clients (Browser/Mobile)
  |-- Text UI (Next.js) -> /api/chat -> Gemini 2.5 Flash
  |-- Voice UI (WebSocket) -> voice-server -> Gemini Live API
                          |-> Shared Tool Registry
                          |-> Qdrant (KB)
                          |-> GCS (Assets)
                          |-> Perplexity (Web Search)
```

---

## Key Directories & Files

- `app/api/chat/route.ts` - text agent streaming + tool orchestration
- `app/api/budget/route.ts` - budget endpoint
- `app/api/send/route.ts` - contact form
- `app/api/refresh-asset-url/route.ts` - GCS URL refresh
- `voice-server/server.js` - voice server
- `voice-server/providers/gemini-live-transport.js` - tool call protocol for Gemini Live
- `tools/_core/registry.js` - tool loader + execution
- `tools/_build/tool-builder.js` - registry build
- `tools/tool_registry.json` - generated registry (required at runtime)
- `lib/services/*` - backend service wrappers
- `prompts/core.md` - text system prompt
- `voice-server/prompts/core.md` - voice system prompt
- `kb/**` - markdown KB content and assets
- `scripts/embed-kb.ts` - KB indexing into Qdrant

---

## External Dependencies & Environment Variables

Text agent (Vercel) common vars:
- `GEMINI_API_KEY` (Gemini text + embeddings + tool summarizer fallback)
- `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY`
- `PERPLEXITY_API_KEY` (for `perplexity_search` tool)
- `RESEND_API_KEY` and optional `CONTACT_EMAIL`
- `NEXT_PUBLIC_VOICE_SERVER_URL`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- Upstash Redis:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- GCS credentials (one of):
- `GCS_SERVICE_ACCOUNT_KEY` (base64 JSON)
- `GOOGLE_APPLICATION_CREDENTIALS` (JSON string or file path)
- `GCS_KEY_FILE` (file path)
- Optional: `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`

Voice server (Railway) common vars:
- `VERTEXAI_PROJECT` (required for Live API)
- `VERTEXAI_LOCATION` (optional, default `us-central1`)
- `GOOGLE_APPLICATION_CREDENTIALS` (JSON string or file path) or ADC
- `GEMINI_API_KEY` (fallback for non-live flows + tool summarizer)
- `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY`
- `PERPLEXITY_API_KEY` (if web search tool used)
- `ALLOWED_ORIGINS` (comma-separated)
- `PORT` (Railway assigns)
- Upstash Redis (if shared usage limits enforced): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- GCS credentials if using `kb_get` for assets

---

## Development Setup

Prerequisites:
- Node.js 24.x (see `.nvmrc`)
- npm
- `.env` at repo root and `voice-server/.env` for voice server

Install:
```bash
npm install
cd voice-server && npm install && cd ..
```

Build tools registry (required):
```bash
npm run build:tools
```

Development servers:
```bash
npm run dev        # Text agent + UI
npm run dev:voice  # Voice server
npm run dev:all    # Text + voice + tools watcher
```

---

## Testing & Validation

- Lint: `npm run lint`
- Tool registry build: `npm run build:tools`
- Tests: `npm test`
- Voice agent test: `npm run test:voice`
- Text agent test: `npm run test:agent`

See `CLOUD.md` and `tests/TEST_SUMMARY.md` for coverage details.

---

## Critical Constraints & Budgets

Text agent:
- Token budget: `TOKEN_CONFIG.MAX_TOKENS` (30k)
- Summary cap: `TOKEN_CONFIG.SUMMARY_WORD_LIMIT` (80 words)
- Message windowing: `MESSAGE_LIMITS.MAX_RAW_MESSAGES` (20)
- Tool chain limit: max 5 chained tool calls
- User budget: 300k tokens total per user (`UsageService`)

Voice agent:
- Max 2 retrieval tool calls per turn
- Max 3 total tool calls per turn
- Latency budgets from tool metadata (`latencyBudgetMs`)
- Loop detection: same tool + args 3x or empty results 2x in a turn

Tool memory:
- Sliding window: last 50 calls, full responses kept for last 10
- Summarization via Gemini Flash Lite (150-token budget)

---

## Decision Tree for Common Changes

- Tool changes: edit `tools/{tool}/` -> `npm run build:tools` -> restart agents -> update static import map in `tools/_core/registry.js` if new tool
- Text agent changes: edit `app/api/chat/` -> `npm test tests/e2e/` -> `npm run build`
- Voice server changes: edit `voice-server/` -> manual testing -> deploy Railway
- KB changes: edit `kb/**/*.md` -> `npm run embed-kb`
- Prompt changes: edit `prompts/*.md` or `voice-server/prompts/*.md` -> restart agents

---

## References

- `CLOUD.md` - testing workflow
- `tools/ARCHITECTURE.md` - tool system internals (note: may be outdated)
- `voice-server/README.md` - voice server usage
- `tests/TEST_SUMMARY.md` - test coverage
