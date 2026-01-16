# Tools Architecture

## Design Principles

1. **Shared by Default** - Tools work for voice AND text agents
2. **Build-Time Compilation** - Registry is a build artifact, not runtime discovery
3. **Provider-Agnostic** - No SDK coupling in runtime code (registry stores canonical JSON Schema)
4. **Explicit Contracts** - ToolResponse envelope is formal and versioned
5. **Intent-Based State** - Tools return intents, orchestrators apply them to session state

## Tool Exposure

**Direct Tool Calling**

All tools are directly exposed to both agents:
- Text agent: Tools declared in API request via `parametersJsonSchema`
- Voice agent: Tools declared in session config via Gemini Native schemas
- No discovery step - models call tools directly

**Available Tools (5):**
1. `kb_search` - Semantic search over knowledge base
2. `kb_get` - Direct retrieval by entity ID
3. `ignore_user` - Block disrespectful users (action tool)
4. `start_voice_session` - Transition to voice mode (text-only)
5. `end_voice_session` - End voice session gracefully (voice-only)

**Context Window Monitoring**
- Session init token estimates logged at startup
- Per-tool response token averages tracked
- Peak context usage monitored via `/metrics` endpoint
- At 5 tools, context usage is minimal (~10-15k tokens for all tool declarations)

## Directory Structure

```
tools/
├── _core/                  # Runtime infrastructure (imported by agents)
│   ├── error-types.js      # ErrorType enum, ToolError class, IntentType enum
│   ├── tool-response.js    # ToolResponse schema + validator
│   ├── registry.js         # Runtime registry loader
│   ├── state-controller.js # State management helper
│   ├── metrics.js          # Response metrics, token tracking, session metrics
│   └── loop-detector.js    # Loop detection (same call 3x, empty results 2x)
│
├── _build/                 # Build-time infrastructure (run once, generate artifact)
│   ├── tool-builder.js     # Main build script
│   ├── provider-adapters/  # Schema format converters
│   │   ├── openai.js       # OpenAI function calling format
│   │   └── gemini-native.js # Gemini SDK Type.* format
│   └── README.md           # Build process documentation
│
├── {tool-name}/            # Individual tool directories
│   ├── schema.json         # JSON Schema + orchestration metadata
│   ├── guide.md            # Tool documentation (simplified format)
│   └── handler.js          # Execution logic
│
└── tool_registry.json      # GENERATED BUILD ARTIFACT (gitignored)
```

## Agent Integration

### Voice Agent (`voice-server/server.js`)

**Import Path:**
```javascript
import { toolRegistry } from '../tools/_core/registry.js';
import { createStateController } from '../tools/_core/state-controller.js';
import { GeminiLiveTransport } from './providers/gemini-live-transport.js';
```

**Mode:** WebSocket with Gemini Live API

**Integration Status:** ✅ **COMPLETE**

**Implementation:**
- Registry loads at startup: `await toolRegistry.load()`
- Provider schemas: `toolRegistry.getProviderSchemas('geminiNative')`
- State controller initialized per session
- Transport layer handles tool call/response protocol
- Orchestrator enforces policies (mode restrictions, budgets)
- All state managed via state controller (no direct variables)

**Constraints:**
- Max 2 retrieval calls per turn (voice latency budget) - **HARD GATE**
- Max 3 total tool calls per turn - **HARD GATE**
- Max 800ms per retrieval tool (soft limit, logs warning)
- Loop detection: Same tool+args 3x or empty results 2x → feedback to agent

**Available Tools:** 5 tools, all directly callable.

### Text Agent (`app/api/chat/route.ts`)

**Import Path:**
```javascript
import { toolRegistry } from '@/tools/_core/registry.js';
import { createStateController } from '@/tools/_core/state-controller.js';
import { ErrorType, ToolError } from '@/tools/_core/error-types';
```

**Mode:** HTTP streaming with Google Gemini API (gemini-3-flash-preview)

**Integration Status:** ✅ **COMPLETE**

**Implementation:**
- Registry loads on first API request: `await toolRegistry.load()`
- Provider schemas: `toolRegistry.getProviderSchemas('geminiNative')` converted to JSON Schema format
- Uses `parametersJsonSchema` format for Gemini 3 (not Type.* enums)
- Schema conversion: uppercase types ("OBJECT", "STRING") → lowercase ("object", "string")
- Tool execution via `toolRegistry.executeTool()`
- State controller initialized per request

**Constraints:**
- Max 5 retrieval calls per turn (text flexibility)
- Max 2s per retrieval tool (soft limit)
- Can use fuller tool context when needed

**Available Tools:** 5 tools, all directly callable.

**Next.js Configuration:**
- Webpack configured to handle markdown files
- Path alias `@/` configured for tool imports
- Handler loading uses `require()` for Next.js (bypasses webpack bundling)
- Dynamic imports work for both Node.js and Next.js environments

## Build Process

```bash
npm run build:tools
```

**What happens:**
1. `tools/_build/tool-builder.js` scans `tools/*/` directories
2. Validates `schema.json` with Ajv (JSON Schema draft 2020-12)
3. Validates `guide.md` exists and extracts summary (second non-empty line)
4. Validates `handler.js` exists and exports `execute()`
5. Generates provider-specific schemas via adapters (OpenAI + Gemini Native)
6. Outputs `tools/tool_registry.json` with content-based version hash

**Simplified Documentation Format:**
- `guide.md` replaces old `doc_summary.md` + `doc.md` structure
- No required section structure (flexible format)
- Recommended sections: Parameters, Examples, Watch Out
- Summary auto-extracted from first non-heading line
- Full guide content included in system instruction for agent context

**Build artifact structure:**
```json
{
  "version": "1.0.abc123de",
  "gitCommit": "a1b2c3d4",
  "buildTimestamp": "2026-01-13T10:00:00Z",
  "tools": [
    {
      "toolId": "ignore_user",
      "category": "action",
      "jsonSchema": { /* canonical JSON Schema */ },
      "providerSchemas": {
        "openai": { /* OpenAI format */ },
        "geminiNative": { /* Gemini Type.* format */ }
      },
      "summary": "Block user for specified duration...",
      "documentation": "# ignore_user\n\n## Summary...",
      "handlerPath": "file:///path/to/handler.js"
    }
  ]
}
```

## Tool Categorization

### Retrieval Tools (Agent's "Eyes")
- Read-only operations
- Idempotent (safe to retry)
- Fast (voice: <800ms, text: <2s)
- Examples: `kb_search`, `kb_get`, `linkedin_lookup`

### Action Tools (Agent's "Hands")
- Side effects (writes, API calls)
- May require confirmation
- Examples: `ignore_user`, `calendar_create_event`, `end_voice_session`

### Utility Tools (Deterministic Helpers)
- Transform, extract, format
- Predictable outputs
- Examples: `extract_contacts`, `format_datetime`

## Adding a New Tool

See `tools/README.md` for detailed guide.

**Quick steps:**
1. Create `tools/{tool-name}/` directory
2. Add 3 required files (schema.json, guide.md, handler.js)
3. Run `npm run build:tools`
4. Restart agents
5. Tool is automatically available

**No changes needed to:**
- Agent code (server.js, route.ts)
- Prompt files
- Configuration

**guide.md Format:**
```markdown
# tool_name
[1-2 sentence description]

## Parameters
- param1 (required): description
- param2 (optional): description, default value

## Examples
**Scenario 1:**
\```json
{ "param1": "value" }
\```

## Watch Out (optional)
- Common mistake 1
- Common mistake 2
```

## Contracts & Versioning

### ToolResponse Envelope (v1.0.0)

All tool handlers MUST return:
```javascript
// Success
{ ok: true, data: {...}, intents: [...], meta: {...} }

// Failure
{ ok: false, error: { type, message, retryable }, meta: {...} }
```

### Error Types

Generated by different layers:
- **Registry**: `VALIDATION`, `NOT_FOUND`, `INTERNAL`
- **Orchestrator**: `MODE_RESTRICTED`, `BUDGET_EXCEEDED`, `CONFIRMATION_REQUIRED`
- **Tool Handler**: `SESSION_INACTIVE`, `TRANSIENT`, `PERMANENT`, `CONFLICT`, `AUTH`, `RATE_LIMIT`

### Intent Types

Tools can return intents for orchestrator to apply:
- `END_VOICE_SESSION` - End voice session after current turn
- `SUPPRESS_AUDIO` - Don't generate audio response
- `SUPPRESS_TRANSCRIPT` - Don't show transcript
- `SET_PENDING_MESSAGE` - Queue message for next turn

## Provider Abstraction

**Problem:** Can't couple registry to Gemini SDK specifics (`Type.*` enums)

**Solution:** Three-layer architecture

1. **Registry Layer** - Stores canonical JSON Schema (provider-agnostic)
2. **Adapter Layer** - Converts schemas at build time (OpenAI, Gemini Native)
3. **Transport Layer** - Abstracts tool call/response protocol (per agent)

**Gemini 3 Format Handling:**
- **Voice Server:** Uses `geminiNative` schemas with Type.* enums (via Gemini Live API)
- **Text Agent:** Uses `geminiNative` schemas converted to JSON Schema format with `parametersJsonSchema`
  - Converts uppercase types ("OBJECT", "STRING") to lowercase ("object", "string")
  - Uses `parametersJsonSchema` field instead of `parameters` field
  - Compatible with Gemini 3's dual format support

**Result:** Switch providers in 2 lines:
```javascript
// const transport = new GeminiLiveTransport(geminiSession);
const transport = new OpenAITransport(client, conversationId);
```

## Key Architectural Decisions

### Why Build-Time Compilation?
- Catch errors before deployment (schema validation, missing files)
- No runtime filesystem scanning (faster startup)
- Deterministic builds (content-based versioning)
- Version locking per session (no mid-session changes)

### Why Intent-Based State?
- Tools don't mutate session state directly (safer)
- Orchestrator controls when/how intents apply
- Clear audit trail (intents logged with tool execution)
- Easier to test tools in isolation

### Why Canonical JSON Schema?
- Provider-agnostic (not tied to any SDK)
- Standard tooling (Ajv, editors, linters)
- Future-proof (OpenAPI, AsyncAPI compatible)
- Runtime validation consistency

### Why Single-Source Documentation?
- All concrete tool docs live in `/tools/{tool-name}/guide.md` (single source of truth)
- No duplication between voice-server prompts and tool directories
- Simpler maintenance: one place to edit per tool

## Observability & Monitoring

### Loop Detection (`tools/_core/loop-detector.js`)

**Problem:** Agents can get stuck calling the same tool repeatedly or searching for non-existent data.

**Solution:** Per-turn loop detection with agent feedback

**Detection Rules:**
1. **Same Call Repeated**: Tool called 3+ times with identical arguments in one turn
   - Returns: `LOOP_DETECTED` error with message
   - Example: `"Loop detected: kb_search called 3 times with identical arguments. Try a different approach or rephrase your query."`

2. **Empty Results Repeated**: Tool returns empty/blank results 2+ times in one turn
   - Returns: `LOOP_DETECTED` error with suggestion
   - Example: `"kb_search returned empty results 2 times. Data may not exist. Try different search terms or a different tool."`

**Implementation:**
```javascript
// Before tool execution
const loopCheck = loopDetector.detectLoop(sessionId, currentTurn, toolId, args);
if (loopCheck.detected) {
  // Return feedback to agent instead of executing
  await transport.sendToolResult({
    id: call.id,
    name: call.name,
    result: {
      ok: false,
      error: {
        type: 'LOOP_DETECTED',
        message: loopCheck.message,
        retryable: false
      }
    }
  });
  continue;  // Skip execution
}

// After execution
loopDetector.recordCall(sessionId, currentTurn, toolId, args, result);
```

**Cleanup:** History retained for last 5 turns per session, automatically pruned.

### Response Size & Token Tracking (`tools/_core/metrics.js`)

**Tracked Metrics:**
- **Response sizes** (chars): P50, P95, P99 per tool (last 1000 responses)
- **Token estimates**: Rough estimate using `chars / 4` formula
- **Response latency**: Per-tool execution time percentiles
- **Session metrics**: Tool calls per session, turn count, session duration

**Token Estimation:**
```javascript
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
```

**Alert Thresholds:**
- P95 response size > 1500 chars → logged as warning
- Average tokens per tool tracked for capacity planning

**Access via:**
```bash
curl http://localhost:8080/metrics
```

Example response:
```json
{
  "responseSizes": {
    "kb_search": { "p50": 320, "p95": 890, "p99": 1450 },
    "kb_get": { "p50": 780, "p95": 2100, "p99": 3200 }
  },
  "responseTokens": {
    "kb_search": { "avg": 80, "p95": 225 },
    "kb_get": { "avg": 195, "p95": 525 }
  },
  "context": {
    "sessionInitTokens": 12500,
    "systemPromptTokens": 3200,
    "toolDeclTokens": 9300
  },
  "loopDetection": {
    "activeSessions": 3,
    "totalTurnsTracked": 47
  }
}
```

### Context Window Monitoring

**Goal:** Ensure Gemini's 1M token context window is not exceeded.

**Tracked at Session Init:**
- System prompt token count
- Tool declaration token count (5 tools, direct exposure)
- Total session init context

**Logged Example:**
```
[Context] Session init: ~X tokens
  - System prompt: ~Y tokens
  - Tool declarations (5 tools): ~Z tokens
```

**Monitoring Strategy:**
1. Track session init baseline (~10-15k tokens for 5 tools)
2. Monitor per-tool response averages (typically 80-500 tokens)
3. Alert if peak usage trends toward 900k+ tokens
4. Monitor tool count growth (add complexity only when needed)

**Context Budget Assumptions:**
- Session init: depends on tool exposure mode
- Average conversation: 10-20 turns × 200-500 tokens/turn = 2-10k tokens
- Tool responses: 5-10 calls × 100-500 tokens = 0.5-5k tokens
- **Total typical usage:** ~20-30k tokens (well under 1M limit)

### Per-Session Tracking

**Session Lifecycle:**
```javascript
// On connection
startSession(sessionId);

// During conversation
recordSessionToolCall(sessionId, toolId, args, duration, ok);
recordResponseMetrics(toolId, responseData);

// On turn complete
startNewTurn(sessionId);

// On disconnect
endSession(sessionId);
```

**Session Data:**
- Session ID, start time, duration
- Tool calls per session (with args, timing, success/failure)
- Turn count
- Loop detection history (per turn)

**Use Cases:**
- Debug agent behavior patterns
- Identify problematic tool usage
- Track performance regressions
- Audit tool reliability

## Performance Considerations

### Voice Mode
- Registry loads once at startup (not per-request)
- Summaries pre-loaded in prompt
- Full docs only fetched when needed
- Tool execution <1s target (orchestrator logs if exceeded)

### Text Mode
- Same registry load (shared infrastructure)
- Can afford slightly larger prompts
- More flexible retrieval budgets

## Security & Safety

### Validation Layers
1. **Build-time** - Schema syntax, required fields, doc structure
2. **Runtime schema** - Ajv validates parameters against JSON Schema
3. **Runtime semantic** - Tool handlers validate business logic
4. **Orchestrator policy** - Mode restrictions, budgets, confirmation gates

### Error Handling Philosophy
- **Pre-execution errors** - Always `partialSideEffects: false`, `retryable: false`
- **Domain errors** - Tool decides retryability, tracks side effects
- **Unexpected errors** - Assume `partialSideEffects: true` (conservative)

### Confirmation Flow
- Tools with `requiresConfirmation: true` are gated by orchestrator
- Returns `CONFIRMATION_REQUIRED` error with token
- User must approve before execution
- Examples: Calendar events, image generation

## Current Status

### ✅ Completed Phases
- **Phase 0-3:** Core infrastructure, runtime registry, transport layer ✅
- **Phase 4:** Orchestrator integration (voice + text agents) ✅
- **Phase 5:** Tool migrations (all 5 concrete tools) ✅

### Current Tools (5 total)
1. `ignore_user` - Block disrespectful users (text + voice)
2. `start_voice_session` - Initiate voice mode (text only)
3. `end_voice_session` - End voice session gracefully (voice only)
4. `kb_search` - Search knowledge base (text + voice)
5. `kb_get` - Get knowledge base entity (text + voice)

### Integration Status
- ✅ Voice server: Fully integrated, all 5 tools directly exposed
- ✅ Text agent: Fully integrated, all 5 tools directly exposed
- ✅ Registry: Loads successfully in both environments
- ✅ Handler loading: Works for Node.js and Next.js
- ✅ State management: Centralized via state controller
- ✅ Policy enforcement: Budgets and mode restrictions operational
- ✅ Simplified: Meta-tool discovery removed, direct calling only

## Future Evolution

### Phase 6-7 (Next Steps)
- Production hardening (monitoring, error handling)
- Documentation cleanup
- Performance optimization
- Additional tool development

### Future Possibilities
- Tool composition (tools calling tools)
- Background execution (async tools)
- Streaming tool outputs
- Tool versioning per user/org
- A/B testing tool implementations
