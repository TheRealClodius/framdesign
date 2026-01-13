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

## Phase 4: Orchestrator Updates 🚧 (NOT STARTED)

**Goal:** Integrate registry into voice and text agents

**Pending Work:**

### 4a. Voice Server Integration (`voice-server/server.js`)

**Implementation Needed:**
1. Load registry at startup
   - `await toolRegistry.load()`
   - `toolRegistry.lock()`
   - Log registry version

2. Get provider schemas
   - `toolRegistry.getProviderSchemas('geminiNative')` for Gemini Live
   - Pass to session config

3. Initialize transport
   - `new GeminiLiveTransport(geminiSession)`

4. Initialize state controller
   - `createStateController({ mode: 'voice', isActive: true, ... })`
   - **CRITICAL:** Store mode explicitly (not inferred from geminiSession)

5. Implement orchestrator pattern
   - Receive tool calls via transport.receiveToolCalls()
   - Get tool metadata: `toolRegistry.getToolMetadata(toolId)`
   - **Policy enforcement:**
     - Mode restrictions (allowedModes check)
     - Voice budget (max 2 retrieval calls, max 3 total) - HARD GATE
     - Confirmation gating (requiresConfirmation check)
   - Execute: `await toolRegistry.executeTool(toolId, context)`
   - Apply intents: `state.applyIntent(intent)`
   - Send result via transport.sendToolResult()
   - **Latency budget:** Log warning if exceeded (SOFT LIMIT, not gate)

6. Implement hash-based idempotency
   - canonicalStringify() for stable hashing
   - Use content hash when provider call.id missing/unstable
   - Track per-session + per-turn

7. Add structured audit logging
   - Log every tool execution with metadata
   - Include toolId, toolVersion, registryVersion, duration, ok status

**Testing:**
- [ ] Mode detection works (explicit, not inferred)
- [ ] Voice budget enforced (3rd retrieval call fails)
- [ ] Idempotency deduplication works
- [ ] State controller intents apply correctly
- [ ] Transport preserves ToolResponse envelope

### 4b. Text Agent Integration (`app/api/chat/route.ts`)

**Implementation Needed:**
1. Load registry at app initialization
   - Consider middleware or route-level initialization
   - May need Next.js ESM import configuration

2. Get provider schemas
   - `toolRegistry.getProviderSchemas('openai')` for OpenAI-compatible providers

3. Similar orchestrator pattern
   - Text mode budgets (max 5 retrieval calls)
   - Same policy enforcement logic
   - No transport layer needed (direct API calls)

**Testing:**
- [ ] Registry loads in Next.js context
- [ ] Text mode budgets enforced
- [ ] Tool execution works via route handler

### 4c. Prompt Loader Updates

**Update `voice-server/prompt-loader.js`:**
1. Inject tool summaries
   - `toolRegistry.getSummaries()`
   - Include registry version

2. Add stable retrieval-first loop pattern
   - Doesn't change as tools are added
   - Voice-specific constraints documented

**Update or create text prompt loader:**
- Similar pattern for text mode
- Text-specific constraints (looser budgets)

**Testing:**
- [ ] Summaries dynamically injected
- [ ] Prompts stay tight (voice performance)
- [ ] Loop pattern clear and stable

**Deliverables:**
- Voice agent fully integrated with registry
- Text agent integrated with registry
- Policy enforcement operational
- Prompts dynamic and performance-optimized

---

## Phase 5: Tool Migrations ✅ (PARTIALLY COMPLETED)

**Goal:** Migrate existing hardcoded tools to registry

**Completed Work:**

1. **ignore_user Tool** - `tools/ignore-user/`
   - ✅ schema.json (duration_seconds: 30-86400, farewell_message: 10-500 chars)
   - ✅ doc_summary.md (under 250 chars)
   - ✅ doc.md (all 7 required sections)
   - ✅ handler.js (complete implementation)
   - ✅ Category: action
   - ✅ Modes: voice, text
   - ✅ Latency budget: 1000ms
   - ✅ Returns intents: END_VOICE_SESSION, SUPPRESS_TRANSCRIPT

2. **end_voice_session Tool** - `tools/end-voice-session/`
   - ✅ schema.json (reason enum, optional final_message)
   - ✅ doc_summary.md (under 250 chars)
   - ✅ doc.md (all 7 required sections)
   - ✅ handler.js (complete implementation)
   - ✅ Category: action
   - ✅ Modes: voice only
   - ✅ Latency budget: 500ms
   - ✅ Returns intent: END_VOICE_SESSION

**Build Status:**
- ✅ Both tools build successfully
- ✅ Registry version: 1.0.329e5f42
- ✅ All validations passing

**Pending Work:**

3. **Migrate remaining tools** (if any exist)
   - [ ] Identify all existing hardcoded tools in voice-server/server.js
   - [ ] Create tool directories
   - [ ] Write schema, docs, handlers
   - [ ] Test each migration

4. **Remove old hardcoded tools** (after Phase 4 integration)
   - [ ] Remove hardcoded tool definitions from voice-server/server.js
   - [ ] Remove hardcoded tool execution logic
   - [ ] Verify functionality via registry

**Testing:**
- ✅ Tools build and validate correctly
- [ ] Tools work when integrated in Phase 4
- [ ] Old hardcoded tools removed cleanly

---

## Phase 6: Production Hardening 🚧 (NOT STARTED)

**Goal:** Add monitoring, error handling, and performance optimization

**Pending Work:**

1. **Structured Logging**
   - [ ] Tool execution logging with metadata
   - [ ] Registry version tracking in logs
   - [ ] Duration tracking
   - [ ] Budget violation logging
   - [ ] Format: JSON logs for easy parsing

2. **Error Handling**
   - [ ] Graceful degradation for tool failures
   - [ ] Retry logic for transient errors
   - [ ] Clear error messages to users
   - [ ] Error aggregation/monitoring

3. **Performance Monitoring**
   - [ ] Latency budget tracking per tool
   - [ ] Budget violation alerts
   - [ ] Registry load time monitoring
   - [ ] Tool execution metrics

4. **Testing**
   - [ ] Integration tests for both agents
   - [ ] Tool execution tests
   - [ ] Policy enforcement tests (budgets, mode restrictions)
   - [ ] Error handling tests
   - [ ] State controller tests
   - [ ] Transport layer tests

**Success Criteria:**
- [ ] Comprehensive logging in place
- [ ] Error handling robust
- [ ] Performance monitoring active
- [ ] All tests passing

---

## Phase 7: Documentation & Cleanup 🚧 (NOT STARTED)

**Goal:** Final documentation and code cleanup

**Pending Work:**

1. **Update Documentation**
   - [ ] Update README.md with final architecture
   - [ ] Update INTEGRATION.md guides with production patterns
   - [ ] Add troubleshooting guide
   - [ ] Add tool authoring examples
   - [ ] Update this PHASES.md with final status

2. **Code Cleanup**
   - [ ] Remove old hardcoded tool code from voice-server
   - [ ] Remove deprecated imports
   - [ ] Clean up comments and TODOs
   - [ ] Format code consistently
   - [ ] Remove unused files

3. **Final Testing**
   - [ ] End-to-end testing (voice mode)
   - [ ] End-to-end testing (text mode)
   - [ ] Error scenario testing
   - [ ] Performance testing
   - [ ] User acceptance testing

**Success Criteria:**
- [ ] All documentation complete and accurate
- [ ] No deprecated code remaining
- [ ] All tests passing
- [ ] System ready for production

---

## Current Status Summary

**Completed:** Phases 0, 1, 2, 3, and partial Phase 5
**In Progress:** None
**Pending:** Phase 4 (critical), Phase 6, Phase 7, and Phase 5 cleanup

**Next Priority:** Phase 4 (Orchestrator Updates) - This is the critical integration step that makes everything functional.

**Files Ready:**
- ✅ Core infrastructure (error types, registry, state controller)
- ✅ Build system (tool builder, provider adapters)
- ✅ Transport layer (Gemini Live transport)
- ✅ Example tools (ignore_user, end_voice_session)
- ✅ Registry artifact (tool_registry.json generated)

**Files Pending Updates:**
- 🚧 voice-server/server.js (needs orchestrator integration)
- 🚧 voice-server/prompt-loader.js (needs tool summaries injection)
- 🚧 app/api/chat/route.ts (needs registry integration)

**Commands:**
```bash
# Build tool registry
npm run build:tools

# Check current status
cat tools/tool_registry.json | head -20

# Verify tool count
ls -1 tools/ | grep -v "^_" | grep -v "\.md$" | grep -v "\.json$" | wc -l
```
