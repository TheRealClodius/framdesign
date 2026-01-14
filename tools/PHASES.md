# Implementation Phases

## Phase 0: Groundwork ✅ (COMPLETED)

**Goal:** Establish file structure and architectural documentation

**Deliverables:**
- ✅ Directory structure (`tools/_core/`, `tools/_build/`)
- ✅ Architecture documentation (`ARCHITECTURE.md`, `README.md`, `PHASES.md`)
- ✅ Placeholder files with TODOs and interface sketches
- ✅ Integration documentation for both agents
- ✅ Build scripts in package.json
- ✅ Updated .gitignore

**Success Criteria:**
- ✅ Any developer can answer "where does X go?"
- ✅ Clear import paths documented for voice and text agents
- ✅ Structure established without implementation

---

## Phase 1: Core Contracts & Builder ✅ (COMPLETED)

**Goal:** Implement foundational contracts and build infrastructure

**Completed Work:**

1. **Core Contracts**
   - ✅ `tools/_core/error-types.js`
     - Complete ErrorType enum (12 types: VALIDATION, NOT_FOUND, INTERNAL, MODE_RESTRICTED, BUDGET_EXCEEDED, CONFIRMATION_REQUIRED, SESSION_INACTIVE, TRANSIENT, PERMANENT, RATE_LIMIT, AUTH, CONFLICT)
     - ToolError class with constructor (type, message, options)
     - IntentType enum (END_VOICE_SESSION, SUPPRESS_AUDIO, SUPPRESS_TRANSCRIPT, SET_PENDING_MESSAGE)
     - Layer responsibility documentation

   - ✅ `tools/_core/tool-response.js`
     - ToolResponse schema definition
     - Complete validateToolResponse() function
     - TOOL_RESPONSE_SCHEMA_VERSION = '1.0.0'
     - Error generation rules documented

2. **Provider Adapters**
   - ✅ `tools/_build/provider-adapters/openai.js`
     - toOpenAI() - Pass-through converter (returns OpenAI function calling format)

   - ✅ `tools/_build/provider-adapters/gemini-native.js`
     - toGeminiNative() - Recursive converter to Type.* enums
     - Handles nested objects, arrays, enums
     - Uses `Type` from `@google/genai`

3. **Build System**
   - ✅ `tools/_build/tool-builder.js`
     - Tool directory scanning (ignores _core, _build)
     - Schema.json validation with Ajv
     - Documentation validation (doc_summary.md ≤250 chars, doc.md with 7 required sections)
     - Provider schema generation via adapters
     - Content-based versioning (SHA256 hash)
     - Git commit tracking
     - Comprehensive error messages

**Dependencies Installed:**
- ✅ `ajv@8.17.1`
- ✅ `ajv-formats@3.0.1`

**Package Updates:**
- ✅ Added `"type": "module"` to package.json
- ✅ Added scripts: `build:tools`, `prebuild`, `prestart`

**Testing Results:**
- ✅ Build script validates JSON Schema syntax
- ✅ Ajv formats work (email, date-time, uri)
- ✅ Both provider schemas generated (OpenAI + Gemini Native)
- ✅ Missing files cause build failure
- ✅ Missing doc sections cause build failure
- ✅ toolId/directory name mismatch detected
- ✅ Empty registry (0 tools) builds successfully
- ✅ Registry with 2 tools builds successfully

**Build Output:**
```
Version: 1.0.329e5f42
Git commit: 5093ccc
Tools: 2 (ignore_user, end_voice_session)
Output: tools/tool_registry.json (gitignored)
```

---

## Phase 2: Runtime Registry ✅ (COMPLETED)

**Goal:** Create provider-agnostic registry loader

**Completed Work:**

1. **Registry Implementation** - `tools/_core/registry.js`
   - ✅ `load()` - Reads tool_registry.json, compiles Ajv validators per tool, dynamic imports handlers
   - ✅ `getProviderSchemas(provider)` - Returns pre-computed schemas (no runtime conversion)
   - ✅ `getSummaries()` - Formats tool summaries for prompt injection
   - ✅ `getDocumentation(toolId)` - Returns full markdown documentation
   - ✅ `getToolMetadata(toolId)` - Returns orchestration metadata
   - ✅ `executeTool(toolId, context)` - Validates args, executes handler, normalizes response
   - ✅ `lock()` / `snapshot()` - Immutability for production
   - ✅ `reload()` - Dev-only hot reload (throws if locked)
   - ✅ `getVersion()` / `getGitCommit()` - Version info
   - ✅ NO provider SDK imports (provider-agnostic)

2. **State Controller** - `tools/_core/state-controller.js`
   - ✅ `createStateController(initialState)` - Factory function
   - ✅ `get(key)` - Read state value
   - ✅ `set(key, value)` - Write state value
   - ✅ `applyIntent(intent)` - Applies intents with proper reference mutation
   - ✅ `getSnapshot()` - Immutable state copy
   - ✅ Fixes original buggy value-passing

**Key Features:**
- ✅ Full ToolResponse envelope preservation
- ✅ Exception handling (ToolError vs unexpected errors)
- ✅ Metadata injection (toolVersion, registryVersion, duration, responseSchemaVersion)
- ✅ Comprehensive validation at execution time
- ✅ Provider-agnostic runtime (no Type.* imports)

**Testing:**
- ✅ Registry loads successfully (tested with empty + 2 tools)
- ✅ Provider schemas accessible
- ✅ Tool execution returns proper ToolResponse envelope
- ✅ State controller properly mutates by reference

---

## Phase 3: Transport Layer ✅ (COMPLETED)

**Goal:** Abstract tool call/response protocol from provider specifics

**Completed Work:**

1. **Transport Interface** - `voice-server/providers/transport-interface.js`
   - ✅ Base `ToolTransport` class
   - ✅ `receiveToolCalls(modelEvent)` - Abstract method
   - ✅ `sendToolResult({ id, name, result })` - Abstract method
   - ✅ Documentation: MUST preserve full ToolResponse envelope

2. **Gemini Live Transport** - `voice-server/providers/gemini-live-transport.js`
   - ✅ Extends ToolTransport
   - ✅ Parses `serverContent.toolCall.functionCalls` format
   - ✅ Sends `clientContent.toolResponse.functionResponses` format
   - ✅ Preserves full ToolResponse envelope

3. **OpenAI Transport** - `voice-server/providers/openai-transport.js`
   - ✅ Extends ToolTransport
   - ✅ Parses `response.function_call_arguments.done` events
   - ✅ Sends `conversation.item.create` format
   - ✅ Preserves full ToolResponse envelope
   - ℹ️ Note: Included for architecture completeness, focus is on Gemini

**Purpose:**
- ✅ Provider-specific protocol handling
- ✅ Normalized interface for orchestrator
- ✅ Full envelope preservation (critical requirement)

---

## Phase 4: Orchestrator Updates ✅ (COMPLETED)

**Goal:** Integrate registry into voice and text agents

**Completed Work:**

### 4a. Voice Server Integration (`voice-server/server.js`) ✅

**Implementation Completed:**
1. ✅ Load registry at startup
   - `await toolRegistry.load()` at module level
   - `toolRegistry.lock()` after load
   - Logs registry version and tool count

2. ✅ Get provider schemas
   - `toolRegistry.getProviderSchemas('geminiNative')` for Gemini Live
   - Passed to session config: `tools: [{ functionDeclarations: geminiToolSchemas }]`

3. ✅ Initialize transport
   - `new GeminiLiveTransport(geminiSession)` after session creation
   - Transport handles tool call parsing and response formatting

4. ✅ Initialize state controller
   - `createStateController({ mode: 'voice', isActive: true, ... })` per session
   - **CRITICAL:** Mode stored explicitly, not inferred

5. ✅ Implement orchestrator pattern
   - Receives tool calls via `transport.receiveToolCalls(message)`
   - Gets tool metadata: `toolRegistry.getToolMetadata(call.name)`
   - **Policy enforcement:**
     - ✅ Mode restrictions (allowedModes check)
     - ✅ Voice budget (max 2 retrieval calls, max 3 total) - HARD GATE
     - ✅ Confirmation gating (requiresConfirmation check) - Ready for future tools
   - Executes: `await toolRegistry.executeTool(call.name, executionContext)`
   - Applies intents: `state.applyIntent(intent)` with full tool data storage
   - Sends result via `transport.sendToolResult()`
   - **Latency budget:** Logs warning if exceeded (SOFT LIMIT)

6. ✅ State management migration
   - All state variables replaced with state controller
   - `state.get()` and `state.set()` used throughout
   - Intents properly applied with full tool result data

7. ✅ Structured audit logging
   - JSON logs for every tool execution
   - Includes: toolId, toolVersion, registryVersion, duration, ok status, category, mode

**Testing Results:**
- ✅ Registry loads successfully at startup
- ✅ All 5 tools available in Gemini session config
- ✅ Health endpoint responds correctly
- ✅ No crashes or undefined variable errors
- ✅ State controller manages all session state

### 4b. Text Agent Integration (`app/api/chat/route.ts`) ✅

**Implementation Completed:**
1. ✅ Load registry on first API request
   - `await toolRegistry.load()` in POST handler
   - `toolRegistry.lock()` after load
   - Logs registry version

2. ✅ Get provider schemas with format conversion
   - `toolRegistry.getProviderSchemas('geminiNative')` 
   - Converts to JSON Schema format for Gemini 3
   - Uses `parametersJsonSchema` field (not `parameters` with Type.* enums)
   - Converts uppercase types ("OBJECT", "STRING") → lowercase ("object", "string")

3. ✅ Tool execution via registry
   - `toolRegistry.executeTool()` for ignore_user and start_voice_session
   - State controller initialized per request
   - Proper error handling and structured logging

4. ✅ Removed hardcoded tools
   - Deleted `ignoreUserTool` and `startVoiceSessionTool` definitions
   - All tool references use `providerSchemas` from registry
   - Fixed in 3 locations: system prompt cache, summary cache, non-cached path

5. ✅ Next.js configuration
   - Webpack configured to handle markdown files
   - Path alias `@/` configured
   - Handler loading uses `require()` for Next.js compatibility

**Testing Results:**
- ✅ Registry loads successfully on first API request
- ✅ All 5 tools available in Gemini API calls
- ✅ API responds correctly
- ✅ No "undefined" or "not found" errors
- ✅ Schema format compatible with Gemini 3

### 4c. Handler Loading Compatibility ✅

**Implementation Completed:**
- ✅ Dual environment support
  - Next.js: Uses `require()` with absolute file paths (bypasses webpack)
  - Node.js: Uses dynamic `import()` with file:// URLs
- ✅ Environment detection via `process.env.NEXT_RUNTIME`
- ✅ Proper error handling and logging

**Deliverables:** ✅ **ALL COMPLETE**
- ✅ Voice agent fully integrated with registry
- ✅ Text agent integrated with registry
- ✅ Policy enforcement operational
- ✅ All 5 tools available in both agents
- ✅ State management via state controller
- ✅ Structured audit logging

---

## Phase 5: Tool Migrations ✅ (COMPLETED)

**Goal:** Migrate existing hardcoded tools to registry

**Completed Work:**

1. **ignore_user Tool** - `tools/ignore-user/` ✅
   - ✅ schema.json (duration_seconds: 30-86400, farewell_message: 10-500 chars)
   - ✅ doc_summary.md (under 250 chars)
   - ✅ doc.md (all 7 required sections)
   - ✅ handler.js (complete implementation)
   - ✅ Category: action
   - ✅ Modes: voice, text
   - ✅ Latency budget: 1000ms
   - ✅ Returns intents: END_VOICE_SESSION, SUPPRESS_TRANSCRIPT
   - ✅ **Integrated and working in both agents**

2. **end_voice_session Tool** - `tools/end-voice-session/` ✅
   - ✅ schema.json (reason enum, optional final_message)
   - ✅ doc_summary.md (under 250 chars)
   - ✅ doc.md (all 7 required sections)
   - ✅ handler.js (complete implementation)
   - ✅ Category: action
   - ✅ Modes: voice only
   - ✅ Latency budget: 500ms
   - ✅ Returns intent: END_VOICE_SESSION
   - ✅ **Integrated and working in voice agent**

3. **start_voice_session Tool** - `tools/start-voice-session/` ✅
   - ✅ schema.json (optional pending_request)
   - ✅ doc_summary.md (under 250 chars)
   - ✅ doc.md (all 7 required sections)
   - ✅ handler.js (complete implementation)
   - ✅ Category: action
   - ✅ Modes: text only
   - ✅ Latency budget: 500ms
   - ✅ **Integrated and working in text agent**

4. **kb_search Tool** - `tools/kb-search/` ✅
   - ✅ schema.json (query, filters, top_k)
   - ✅ doc_summary.md (under 250 chars)
   - ✅ doc.md (all 7 required sections)
   - ✅ handler.js (complete implementation with vector search)
   - ✅ Category: retrieval
   - ✅ Modes: voice, text
   - ✅ Latency budget: 800ms
   - ✅ **Available in both agents**

5. **kb_get Tool** - `tools/kb-get/` ✅
   - ✅ schema.json (entity_id, entity_type)
   - ✅ doc_summary.md (under 250 chars)
   - ✅ doc.md (all 7 required sections)
   - ✅ handler.js (complete implementation)
   - ✅ Category: retrieval
   - ✅ Modes: voice, text
   - ✅ Latency budget: 800ms
   - ✅ **Available in both agents**

**Build Status:**
- ✅ All 5 tools build successfully
- ✅ Registry version: 1.0.249a595d (current)
- ✅ All validations passing

**Migration Completed:**
- ✅ Removed hardcoded tool definitions from `voice-server/server.js`
- ✅ Removed hardcoded tool definitions from `app/api/chat/route.ts`
- ✅ All tools now use registry system
- ✅ No hardcoded tool execution logic remains

**Testing:**
- ✅ Tools build and validate correctly
- ✅ Tools work via registry in both agents
- ✅ Old hardcoded tools removed cleanly
- ✅ All 5 tools available and functional

---

## Phase 6: Production Hardening ✅ (COMPLETED)

**Goal:** Add monitoring, error handling, and performance optimization

**Completed Work:**

1. **Structured Logging** ✅ **COMPLETE**
   - ✅ Tool execution logging with metadata (JSON format)
   - ✅ Registry version tracking in logs
   - ✅ Duration tracking per tool execution
   - ✅ Budget violation logging (warnings for latency budget exceeded)
   - ✅ Retry attempt logging with attempt numbers and delays
   - ✅ Format: JSON logs for easy parsing
   - **Implementation:** Both `voice-server/server.js` and `app/api/chat/route.ts` log tool executions with full metadata

2. **Error Handling** ✅ **COMPLETE**
   - ✅ Basic error handling in registry (`tools/_core/registry.js`)
   - ✅ ToolError class for expected domain errors
   - ✅ Error type classification (ErrorType enum)
   - ✅ Error responses include retryability and side effect flags
   - ✅ Retry logic for transient errors (`tools/_core/retry-handler.js`)
   - ✅ Exponential backoff implementation
   - ✅ Retry tracking in logs
   - ✅ Idempotency and partial side effects handling
   - ✅ Mode-aware retry policy (no retries in voice mode)

3. **Performance Monitoring** ✅ **COMPLETE**
   - ✅ Latency tracking per tool with percentiles (p50, p95, p99)
   - ✅ Budget violation tracking (count and rate)
   - ✅ Registry load time monitoring
   - ✅ Tool execution metrics collection (`tools/_core/metrics.js`)
   - ✅ Metrics HTTP endpoint (`tools/_core/metrics-endpoint.js`)
   - ✅ Error rate tracking by error type
   - ✅ In-memory metrics storage with configurable retention

4. **Testing** ✅ **COMPLETE**
   - ✅ Integration tests for both agents (`scripts/test-integration.sh`)
   - ✅ Unit tests for registry (`tests/tools/_core/registry.test.js`)
   - ✅ Unit tests for state controller (`tests/tools/_core/state-controller.test.js`)
   - ✅ Unit tests for error types (`tests/tools/_core/error-types.test.js`)
   - ✅ Unit tests for tool response (`tests/tools/_core/tool-response.test.js`)
   - ✅ Policy enforcement tests (`tests/tools/policy-enforcement.test.js`)
   - ✅ Tool execution tests (`tests/tools/execution.test.js`)
   - ✅ E2E tests for voice mode (`tests/e2e/tool-execution-voice.test.js`)
   - ✅ E2E tests for text mode (`tests/e2e/tool-execution-text.test.js`)
   - ✅ Error scenario tests (`tests/e2e/error-scenarios.test.js`)
   - ✅ Performance tests (`tests/e2e/performance.test.js`)

**Success Criteria:**
- ✅ Comprehensive logging in place
- ✅ Error handling robust with retry logic
- ✅ Performance monitoring active with metrics collection
- ✅ Comprehensive test suite covering all critical paths

---

## Phase 7: Documentation & Cleanup ✅ (COMPLETED)

**Goal:** Final documentation and code cleanup

**Completed Work:**

1. **Update Documentation** ✅ **COMPLETE**
   - ✅ Updated `tools/README.md` with final architecture
   - ✅ Updated `app/api/chat/INTEGRATION.md` with production patterns
   - ✅ Updated `voice-server/INTEGRATION.md` with actual implementation
   - ✅ Updated `tools/ARCHITECTURE.md` with current status
   - ✅ Updated `TOOLS_ARCHITECTURE_REVIEW.md` (critical issues resolved)
   - ✅ Created `TOOLS_IMPLEMENTATION_STATUS.md` (status summary)
   - ✅ Updated `tools/PHASES.md` with current status
   - ✅ Created troubleshooting guide (`tools/TROUBLESHOOTING.md`)
   - ✅ Tool authoring examples exist in `tools/README.md`

2. **Code Cleanup** ✅ **COMPLETE**
   - ✅ Removed old hardcoded tool code from `voice-server/server.js`
   - ✅ Removed old hardcoded tool code from `app/api/chat/route.ts`
   - ✅ No deprecated imports found (verified)
   - ✅ No TODOs/FIXMEs found in core tool files (verified)
   - ✅ Code formatting appears consistent
   - ✅ No unused files identified

3. **Final Testing** ✅ **COMPLETE**
   - ✅ Integration tests exist (`scripts/test-integration.sh`)
   - ✅ Basic startup/registry loading tests passing
   - ✅ End-to-end tool execution tests (voice mode)
   - ✅ End-to-end tool execution tests (text mode)
   - ✅ Error scenario testing (budget exceeded, mode restrictions, validation failures)
   - ✅ Performance testing (latency budgets, concurrent executions, metrics)
   - ✅ Comprehensive unit test coverage for core modules

**Success Criteria:**
- ✅ All documentation complete and accurate
- ✅ No deprecated code remaining
- ✅ Comprehensive test suite covering all critical paths
- ✅ System production-ready with monitoring and error handling

---

## Current Status Summary

**Completed:** All Phases 0-7 ✅

**Phase 6 Status:** ✅ **COMPLETE**
- ✅ Structured logging: Complete with retry tracking
- ✅ Error handling: Robust with retry logic and exponential backoff
- ✅ Performance monitoring: Metrics collection and HTTP endpoint
- ✅ Testing: Comprehensive test suite (unit, integration, E2E, performance)

**Phase 7 Status:** ✅ **COMPLETE**
- ✅ Documentation: All docs updated including troubleshooting guide
- ✅ Code cleanup: No deprecated code, no TODOs found
- ✅ Final testing: Comprehensive E2E tests covering all scenarios

**Integration Status:** ✅ **COMPLETE**
- ✅ Voice server fully integrated with registry
- ✅ Text agent fully integrated with registry
- ✅ All 5 tools available and functional
- ✅ State management via state controller
- ✅ Policy enforcement operational
- ✅ Structured audit logging implemented

**Files Completed:**
- ✅ Core infrastructure (error types, registry, state controller)
- ✅ Build system (tool builder, provider adapters)
- ✅ Transport layer (Gemini Live transport)
- ✅ All 5 tools (ignore_user, start_voice_session, end_voice_session, kb_search, kb_get)
- ✅ Registry artifact (tool_registry.json generated)
- ✅ voice-server/server.js (fully integrated with registry)
- ✅ app/api/chat/route.ts (fully integrated with registry)
- ✅ next.config.ts (webpack configuration for tool handlers)

**Current Tool Count:** 5 tools
1. `ignore_user` - Action tool (text + voice)
2. `start_voice_session` - Action tool (text only)
3. `end_voice_session` - Action tool (voice only)
4. `kb_search` - Retrieval tool (text + voice)
5. `kb_get` - Retrieval tool (text + voice)

**Commands:**
```bash
# Build tool registry
npm run build:tools

# Check current status
cat tools/tool_registry.json | head -20

# Verify tool count
ls -1 tools/ | grep -v "^_" | grep -v "\.md$" | grep -v "\.json$" | wc -l
```
