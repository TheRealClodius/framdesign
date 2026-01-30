# CLAUDE.md - Project Context for AI Assistants

This document provides essential context for Claude and other AI assistants working on the FRAM project.

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
npm test context-stack  # Test context management
```

### Agent Testing
```bash
node scripts/text-agent-test.js --non-interactive  # Run full agent test suite (19 questions)
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
- **Deduplication**: Smart similarity detection including boolean/numeric parameters

### Knowledge Base
- Markdown files with YAML frontmatter in `/kb`
- Chunked and embedded to Qdrant (1000 chars, 200 overlap)
- Semantic search via vector similarity
- Schemas: `person`, `lab`, `project`
- **Current content**: 3 people, 14 projects, 100+ assets

### Message Context Management
- **Context Stack**: Structured message management with timestamps and date ranges
- Keep last 20 raw messages with automatic timestamping
- Auto-summarize when context exceeds limits with date range headers
- Token estimation: ~1 token per 4 characters
- Conversation hashing for Gemini prompt caching (70-83% cache efficiency)
- Smart deduplication prevents redundant tool calls
- Fallback system ensures no empty responses

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
- `guide.md` - Usage documentation with "When to Use" and "When NOT to Use" sections

Tools must return `ToolResponse` objects via `createToolResponse()`.

**Recent Tool Improvements**:
- Enhanced deduplication logic handles boolean parameters correctly
- Image data retrieval fully functional (includes pixel data for visual analysis)
- Tool memory guidance clarified to prevent misuse
- Loop detection prevents infinite tool calls

### Error Handling
- Use error types from `tools/_core/error-types.js`
- Set appropriate `retryable` flags
- Include `userFacingMessage` for display
- Empty response fallback in `/api/chat/route.ts` prevents conversation corruption

### State Management
- Session state via `state-controller.js`
- Tool memory via `tool-memory-store.js`
- Loop detection prevents infinite tool calls

### Tool Memory Architecture

The system always retains full tool outputs, giving agents summaries in context while allowing on-demand access to complete data.

**Core Principle**: Full tool outputs are always stored. Agents see summaries in context but can retrieve full outputs anytime via `query_tool_memory`.

**Server-Side: In-Memory Tool Memory Store** (`tools/_core/tool-memory-store.js`)
- Session-scoped storage keeps **full responses for ALL calls** in the sliding window
- **Window Policy**:
  - Last 50 calls: Full responses always retained
  - Auto-expires after 1 hour (`MAX_AGE_MS`)
  - Calls beyond 50 are dropped (oldest first)
- Full responses always retrievable via `getFullResponse(sessionId, callId)`
- Duplicate detection via similarity matching (85% threshold)

**Server-Side: Deduplication** (`tools/_core/tool-memory-dedup.js`)
- Pre-execution duplicate detection for retrieval tools
- Returns cached full results when similarity >= 85%
- Prevents redundant expensive operations (KB searches, entity lookups)

**Client-Side: localStorage Persistence** (`lib/storage.ts`)
- Conversation messages store full structured tool data:
  - `toolCalls[]`: Array of `{id, name, args}` for each tool invocation
  - `toolResults[]`: Array of `{callId, name, result}` with **full structured results**
- Enables accurate conversation reconstruction across page reloads

**Agent Access: query_tool_memory Tool** (`tools/query-tool-memory/`)
- `get_full_response_for`: Retrieve complete tool output for any call_id
- Query with filters: toolId, timeRange, includeErrors
- Full responses available for all 50 calls in the window

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
- **Unit tests**: Individual functions (e.g., `context-stack.test.ts`)
- **Integration tests**: Component interactions
- **E2E tests**: Full conversation flows (19 test questions, 100% success rate in latest run)
- **Tool tests**: Registry and execution
- **Agent behavior tests**: Comprehensive multi-run testing documented in `AGENT_BEHAVIOR_ANALYSIS.md`

### Running Specific Tests
```bash
npm test message-windowing    # Test message handling
npm test token-estimation     # Test token counting
npm test context-stack        # Test context stack management
```

### Agent Quality Assurance
- **Latest Test Results**: Run 11 achieved 100% success rate (20/20 questions)
- **Average Response Time**: 4.9s
- **Cache Efficiency**: 75.5% (good reuse of system prompts and tool schemas)
- **Tool Efficiency**: 1.1 tools per question (minimal, targeted calls)
- **Zero Hallucinations**: All responses grounded in KB or reliable sources
- **Enhanced Observability**: Detailed context breakdown and tool usage analysis
- **Tool Memory Fix Validated**: Zero query_tool_memory errors in Run 11
- See `docs/AGENT_BEHAVIOR_ANALYSIS.md` for detailed test results and historical improvements

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
5. Tool registry rebuilt (`npm run build:tools`)

## Important Notes

### Performance
- Token budget tracking via `/api/budget`
- Loop detection prevents runaway tool calls
- Metrics collection in `tools/_core/metrics.js`
- Response times: 4-6s average, sub-second for cached KB lookups
- Cache efficiency: 70-83% across test runs

### Assets
- Stored in Google Cloud Storage (GCS)
- Signed URLs generated on demand via `/api/refresh-asset-url`
- Complete manifest in `kb/assets/manifest.json` with blob_id mappings
- Migration status in `docs/GCS_MIGRATION_STATUS.md`
- Image analysis fully functional with pixel data retrieval

### Prompt Architecture
- **Simplified Approach**: Trust-based guidance over rigid decision trees
- **Core Philosophy**: "Simplification over specification" - trust the model's natural judgment
- **Retrieval Logic**: Simple 6-line guidance replaced complex 16-line flowchart (Run 8 improvement)
- **Result**: Better conversational understanding, no greeting misinterpretation issues

### Documentation Locations
- Tool authoring: `tools/README.md`
- Architecture: `AGENTS.md`
- Cloud testing: `CLOUD.md`
- KB schema: `kb/README.md`
- Voice server: `voice-server/README.md`
- Agent testing & behavior: `docs/AGENT_BEHAVIOR_ANALYSIS.md` (comprehensive test results from 10 test runs)
- Prompt guidelines: `prompts/README.md`

## Quick Reference

| Task | Command/Location |
|------|-----------------|
| Start development | `npm run dev:all` |
| Add a new tool | Create dir in `/tools`, add index.js + schema.json + guide.md |
| Add KB content | Create markdown in `/kb/{type}/` |
| Embed KB changes | `npx tsx scripts/Embed/embed-kb.ts` |
| Check tool registry | `tools/tool_registry.json` |
| Debug API | `GET /api/debug-env` |
| View voice metrics | `GET /metrics` on voice server |
| Test agent behavior | `node scripts/text-agent-test.js --non-interactive` |
| View test results | `docs/AGENT_BEHAVIOR_ANALYSIS.md` |

## Troubleshooting

### Common Issues

**Tools not loading**: Run `npm run build:tools` to regenerate registry

**KB search returns nothing**: Verify embeddings with `verify-kb-embedding.ts`

**Voice connection fails**: Check `NEXT_PUBLIC_VOICE_URL` and Railway status

**Build fails on native modules**: Tiktoken is externalized in `next.config.ts`

**Slow dev server**: iCloud Drive handling in `next.config.ts` may need adjustment

**Image data not loading**: Ensure boolean parameters in tool calls are handled correctly by deduplication logic (`tools/_core/utils/similarity.js`)

**Empty agent responses**: Fallback system in `/api/chat/route.ts` prevents empty responses (added in Run 7)

**Tool memory errors**: Only query tool memory for actual call IDs from current session, not fabricated IDs

## Recent Improvements & Fixes

### Context Stack Enhancement (Commit d42a684)
- Added timestamp formatting for messages
- Implemented date range extraction for summaries
- Improved context organization and readability
- New test suite: `tests/context-stack.test.ts`

### Voice Agent Simplification (Commits 6555b92, 5c7b34a)
- Simplified prompt retrieval logic
- Fixed undefined context bug
- Reduced voice prompt complexity for better conversational flow
- Applied "simplification over specification" principle

### Knowledge Base Expansion (Commit f9fa70d)
- Added Francesco Zurlo (person profile)
- Added new projects:
  - Strategie del Design Book
  - That Language App
  - UiPath Studio Mobile
  - UrbanAir/Neobility
- Updated asset organization and manifest (616 lines)

### Critical Bug Fixes (Historical - Documented in AGENT_BEHAVIOR_ANALYSIS.md)

**Run 7 Fixes**:
- **Empty Response Prevention**: Added fallback in `/api/chat/route.ts` (lines 2962-2969)
- **Tool Memory Guidance**: Enhanced `query-tool-memory/guide.md` with "When NOT to Use" section
- **Question Batching**: Ensured individual response to each question

**Run 5 Fixes**:
- **Image Data Caching**: Fixed boolean parameter handling in `similarity.js`
- **Perplexity Search**: Added current date context to prevent refusal of answerable questions
- **KB Assets**: Re-embedded all 113 chunks with current GCS metadata

**Run 8 Improvements**:
- **Prompt Simplification**: Replaced 16-line decision tree with 6-line trust-based guidance
- **Result**: Better conversational understanding, 94.7% success rate (18/19 questions)

### Testing & Quality Improvements
- Conducted 11 comprehensive test runs (Runs 1-11)
- Achieved 100% success rate (20/20 questions) in Run 11
- Documented all findings in `docs/AGENT_BEHAVIOR_ANALYSIS.md` (1600+ lines)
- Fixed all critical issues identified during testing
- Validated multimodal capabilities (image pixel data extraction)
- Confirmed external search reliability (perplexity_search)
- Added enhanced observability with detailed context breakdown (Run 10)
- Fixed and validated query_tool_memory full response persistence (Run 11)

## Production Readiness

**Status**: ✅ **PRODUCTION READY** (as of Run 11 - January 30, 2026)

### Quality Metrics
- ✅ 100% success rate (20/20 test questions)
- ✅ 4.9s average response time
- ✅ 75.5% cache efficiency
- ✅ Zero hallucinations across all test runs
- ✅ Multimodal analysis fully functional
- ✅ External search working consistently
- ✅ Graceful error handling
- ✅ Smart tool usage (no loops or redundant calls)
- ✅ Enhanced observability for debugging
- ✅ Tool memory full response persistence fixed and validated

### Key Strengths
- Accurate information retrieval from knowledge base
- Appropriate tool selection and minimal usage
- Efficient context management
- Fast response times with excellent caching
- Strong safety (no hallucinations, grounded responses)
- Functional multimodal capabilities (image + text)
- Consistent external search behavior

### Architectural Principles Applied
1. **Simplification over specification**: Trust the model's natural judgment
2. **Empty response prevention**: Fallback system ensures every question gets an answer
3. **Smart deduplication**: Boolean/numeric parameters properly handled
4. **Clear tool boundaries**: Enhanced guides prevent tool misuse
5. **Context awareness**: Timestamps and date ranges improve conversation flow
