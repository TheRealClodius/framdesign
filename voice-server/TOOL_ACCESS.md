# How the Voice Service Accesses Agent Tools

## Overview

The voice server integrates with the shared tool registry to provide tool capabilities to the Gemini Live API. This document explains the complete flow from tool registration to execution.

## Architecture

The voice service uses a **three-layer architecture** for tool access:

1. **Tool Registry** (`tools/_core/registry.js`) - Centralized tool management
2. **Transport Layer** (`voice-server/providers/gemini-live-transport.js`) - Protocol conversion
3. **Session Handler** (`voice-server/server.js`) - Tool execution orchestration

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SERVER STARTUP                                            │
│    - Load tool_registry.json                                 │
│    - Compile validators                                      │
│    - Import handlers                                         │
│    - Extract Gemini Native schemas                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. SESSION INITIALIZATION                                    │
│    - Build system instruction with tool docs                 │
│    - Configure Gemini Live API with tools                   │
│    - Initialize transport layer                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. TOOL CALL RECEIVED                                        │
│    - Parse from Gemini message                               │
│    - Validate via transport                                  │
│    - Check policies (budgets, modes)                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. TOOL EXECUTION                                            │
│    - Execute via registry                                    │
│    - Apply intents to state                                  │
│    - Return result via transport                             │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step Implementation

### Step 1: Server Startup - Tool Registry Loading

**Location:** `voice-server/server.js` (lines 43-50)

```javascript
// Load tool registry at startup
console.log('Loading tool registry...');
await toolRegistry.load();
toolRegistry.lock(); // Lock registry in production
console.log(`✓ Tool registry loaded: v${toolRegistry.getVersion()}, ${toolRegistry.tools.size} tools, git commit: ${toolRegistry.getGitCommit()}`);

// Get Gemini Native provider schemas for session config (loaded from registry)
const geminiToolSchemas = toolRegistry.getProviderSchemas('geminiNative');
```

**What happens:**
1. Registry reads `tools/tool_registry.json` (generated at build time)
2. Validates tool schemas using Ajv
3. Dynamically imports handler modules
4. Extracts Gemini Native schemas (pre-computed at build time)
5. Locks registry to prevent hot reloading

**Key Point:** Tools are loaded **once at startup**, not per-session. This ensures:
- Consistent tool versions across sessions
- Fast session initialization
- No runtime schema conversion overhead

### Step 2: Session Initialization - Tool Configuration

**Location:** `voice-server/server.js` (lines 890-912)

When a client connects and sends a `start` message:

```javascript
// Build system instruction with tool documentation from registry
const systemInstruction = buildSystemInstruction(toolRegistry);

// Prepare session config with audio input/output enabled
const config = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: systemInstruction,
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: 'Algenib'
      }
    }
  },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  // Add tool support (all 5 tools from registry)
  tools: [{ functionDeclarations: geminiToolSchemas }]
};

geminiSession = await ai.live.connect({
  model: 'gemini-live-2.5-flash-native-audio',
  config: config,
  callbacks: { /* ... */ }
});

// Initialize transport now that session exists
transport = new GeminiLiveTransport(geminiSession);
```

**What happens:**
1. **System Instruction:** `buildSystemInstruction()` appends tool documentation to the base prompt
   - Tool docs come from `tool.documentation` (loaded from `guide.md` files)
   - Each tool's full documentation is included in the system prompt
   
2. **Tool Declarations:** `geminiToolSchemas` contains pre-computed Gemini Native schemas
   - Format: `Type.*` enums (e.g., `Type.STRING`, `Type.OBJECT`)
   - Generated at build time by `tools/_build/provider-adapters/gemini-native.js`
   - All 5 tools are exposed: `kb_search`, `kb_get`, `end_voice_session`, `ignore_user`, `start_voice_session`

3. **Transport Layer:** `GeminiLiveTransport` handles protocol conversion
   - Converts between internal tool format and Gemini Live API format
   - Provides `receiveToolCalls()` and `sendToolResult()` methods

**Key Point:** According to the [Live API documentation](https://ai.google.dev/gemini-api/docs/live), tools are declared in the session configuration using `functionDeclarations`. The Live API supports function calling natively, allowing the model to invoke tools during conversation.

### Step 3: Tool Call Reception - Parsing and Validation

**Location:** `voice-server/server.js` (lines 328-332)

When Gemini sends a tool call in a message:

```javascript
// CRITICAL: Process tool calls FIRST before serverContent
if (message.toolCall && transport) {
  console.log(`[${clientId}] Tool call requested:`, JSON.stringify(message.toolCall, null, 2));

  // Parse tool calls via transport
  const toolCalls = transport.receiveToolCalls(message);
  // ... execute tools ...
}
```

**Transport Layer Parsing:** `voice-server/providers/gemini-live-transport.js` (lines 57-76)

```javascript
receiveToolCalls(modelEvent) {
  const toolCalls = [];

  // Check if event has tool calls
  // Tool calls come at root level: message.toolCall.functionCalls
  if (
    modelEvent.toolCall?.functionCalls &&
    Array.isArray(modelEvent.toolCall.functionCalls)
  ) {
    for (const call of modelEvent.toolCall.functionCalls) {
      toolCalls.push({
        id: call.id || call.name, // Gemini Live might not provide id, use name as fallback
        name: call.name,
        args: call.args || {}
      });
    }
  }

  return toolCalls;
}
```

**Gemini Live API Format:**
According to the Live API documentation, tool calls arrive in the message structure:
```javascript
{
  toolCall: {
    functionCalls: [
      {
        name: 'tool_name',
        id: 'call_id',
        args: { ... }
      }
    ]
  }
}
```

**Key Point:** The transport layer normalizes the Gemini Live API format into a consistent internal format (`{ id, name, args }`), making the rest of the code provider-agnostic.

### Step 4: Policy Enforcement - Budgets and Mode Restrictions

**Location:** `voice-server/server.js` (lines 354-487)

Before executing tools, the voice service enforces several policies:

#### Mode Restrictions
```javascript
// POLICY: Check mode restrictions
const currentMode = state.get('mode');
if (!toolMetadata.allowedModes.includes(currentMode)) {
  // Reject tool call
}
```

#### Voice Budget Limits
```javascript
// POLICY: Enforce voice retrieval budget (HARD GATE)
const VOICE_BUDGET = {
  MAX_RETRIEVAL_CALLS_PER_TURN: 2,
  MAX_TOTAL_CALLS_PER_TURN: 3
};

if (isRetrievalCall) {
  retrievalCallsThisTurn++;
  if (retrievalCallsThisTurn > VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN) {
    // Reject tool call
  }
}
```

#### Loop Detection
```javascript
const loopCheck = loopDetector.detectLoop(
  clientId,
  currentTurn,
  loopCheckKey,
  loopCheckArgs
);

if (loopCheck.detected) {
  // Return feedback to agent instead of executing
}
```

**Key Point:** Voice mode has stricter budgets than text mode (2 retrieval calls vs 5) due to latency constraints. These are **hard gates** - execution is blocked if exceeded.

### Step 5: Tool Execution - Registry Dispatch

**Location:** `voice-server/server.js` (lines 489-520)

```javascript
// Build execution context
const executionContext = {
  clientId,
  ws,
  geminiSession,
  args: call.args || {},
  capabilities: { voice: true, messaging: false }, // Voice mode capabilities
  session: {
    isActive: state.get('isActive'),
    toolsVersion: toolRegistry.getVersion(),
    state: state.getSnapshot()
  }
};

// Execute tool through registry with retry logic
const startTime = Date.now();
const result = await retryWithBackoff(
  () => toolRegistry.executeTool(call.name, executionContext),
  {
    mode: currentMode,
    maxRetries: 3,
    toolId: call.name,
    toolMetadata: toolMetadata,
    clientId: clientId
  }
);
const duration = Date.now() - startTime;
```

**Registry Execution:** `tools/_core/registry.js`

The registry:
1. Validates arguments against JSON Schema
2. Loads handler module dynamically
3. Calls `handler.execute(executionContext)`
4. Validates response against response schema
5. Returns standardized `ToolResponse` envelope:
   ```javascript
   {
     ok: boolean,
     data?: object,      // Success data
     error?: object,     // Error details
     intents?: Array,    // State change intents
     meta: {             // Metadata
       toolId: string,
       duration: number,
       responseSchemaVersion: string
     }
   }
   ```

**Key Point:** The registry provides a **unified execution interface** regardless of provider. The same registry is used by both voice and text agents.

### Step 6: Intent Application - State Management

**Location:** `voice-server/server.js` (lines 553-570)

After successful tool execution, intents are applied to session state:

```javascript
// Apply intents if successful
if (result.ok && result.intents) {
  for (const intent of result.intents) {
    // For END_VOICE_SESSION, store full tool data along with intent
    if (intent.type === 'END_VOICE_SESSION' && result.data) {
      state.set('pendingEndVoiceSession', {
        after: intent.after || 'current_turn',
        reason: result.data.reason || 'user_requested',
        closingMessage: result.data.finalMessage || null,
        textResponse: result.data.textResponse || null
      });
    } else {
      state.applyIntent(intent);
    }
  }
}
```

**Key Point:** Intents allow tools to modify session state (e.g., `END_VOICE_SESSION` sets `pendingEndVoiceSession` flag, which triggers session closure after audio completes).

### Step 7: Tool Result Transmission - Transport Layer

**Location:** `voice-server/server.js` (lines 572-600)

```javascript
// Send result via transport (full ToolResponse envelope)
await transport.sendToolResult({
  id: call.id,
  name: call.name,
  result: result
});

// CRITICAL: After sending the last tool result, signal Gemini to continue generating
const isLastTool = i === toolCalls.length - 1;
if (isLastTool) {
  // Signal Gemini that tool results are complete and it should continue responding
  geminiSession.sendClientContent({ turnComplete: true });
}
```

**Transport Layer Sending:** `voice-server/providers/gemini-live-transport.js` (lines 84-119)

```javascript
async sendToolResult({ id, name, result }) {
  // CRITICAL: Gemini Live API expects only the data/error, not the full envelope
  // Send result.data for success, or result.error for failure
  const responseData = result.ok ? result.data : result.error;

  const functionResponse = {
    name,
    response: responseData // Just the data or error, not the full envelope
  };

  if (id && id !== name) {
    functionResponse.id = id;
  }

  // Use sendToolResponse method - Gemini Live API's dedicated method for tool responses
  await this.geminiSession.sendToolResponse({
    functionResponses: [functionResponse]
  });
}
```

**Gemini Live API Format:**
According to the Live API documentation, tool responses use:
```javascript
{
  clientContent: {
    toolResponse: {
      functionResponses: [
        {
          name: 'tool_name',
          id: 'call_id',
          response: { ... } // Just the data (if ok) or error (if failed)
        }
      ]
    }
  }
}
```

**Key Point:** The transport layer extracts only the `data` or `error` from the internal `ToolResponse` envelope. The full envelope (`{ ok, data/error, intents, meta }`) is for internal use only.

## Tool Documentation Integration

### System Instruction Building

**Location:** `voice-server/config.js` (lines 19-24)

```javascript
export function buildSystemInstruction(toolRegistry) {
  const toolDocs = Array.from(toolRegistry.tools.values())
    .map(tool => `## ${tool.toolId}\n${tool.documentation}`)
    .join('\n\n');

  return `${FRAM_BASE_PROMPT}\n\n# Available Tools\n\n${toolDocs}`;
}
```

**What's included:**
- Base voice behavior prompt (`voice-server/prompts/voice-behavior.md`)
- Full tool documentation from each tool's `guide.md` file
- Tool summaries (extracted from first non-heading line)

**Key Point:** Tool documentation is **injected into the system prompt**, giving Gemini full context about how to use each tool. This is more efficient than discovery-based approaches for voice mode (latency-sensitive).

## Available Tools

The voice service exposes **5 tools** from the registry:

1. **`kb_search`** - Search knowledge base (retrieval, voice + text)
2. **`kb_get`** - Get knowledge base entity (retrieval, voice + text)
3. **`end_voice_session`** - End voice session gracefully (action, voice only)
4. **`ignore_user`** - Block disrespectful users (action, voice + text)
5. **`start_voice_session`** - Initiate voice mode (action, text only)

**Note:** `start_voice_session` is not available in voice mode (it's text-only), but it's still declared to Gemini for consistency.

## Comparison with Live API Documentation

The implementation aligns with the [Live API Tool Use guide](https://ai.google.dev/gemini-api/docs/live-tools):

### ✅ Correct Implementation

1. **Tool Declaration:** Tools are declared in session config using `functionDeclarations`
   ```javascript
   tools: [{ functionDeclarations: geminiToolSchemas }]
   ```

2. **Tool Call Reception:** Tool calls arrive in `message.toolCall.functionCalls`
   ```javascript
   if (message.toolCall?.functionCalls) { /* ... */ }
   ```

3. **Tool Response:** Responses sent via `sendToolResponse()` method
   ```javascript
   geminiSession.sendToolResponse({ functionResponses: [...] })
   ```

4. **Turn Completion:** After tool results, signal Gemini to continue
   ```javascript
   geminiSession.sendClientContent({ turnComplete: true })
   ```

### 🔍 Key Differences from Standard API

1. **WebSocket-based:** Live API uses WebSocket, not HTTP streaming
2. **Real-time:** Tool calls can arrive during audio generation
3. **Interruption:** User can interrupt tool execution with voice input
4. **Latency-sensitive:** Voice mode enforces stricter budgets than text mode

## Error Handling

### Tool Not Found
```javascript
if (!toolMetadata) {
  await transport.sendToolResult({
    id: call.id,
    name: call.name,
    result: {
      ok: false,
      error: {
        type: ErrorType.NOT_FOUND,
        message: `Unknown tool: ${call.name}`,
        retryable: false
      }
    }
  });
}
```

### Mode Restriction
```javascript
if (!toolMetadata.allowedModes.includes(currentMode)) {
  await transport.sendToolResult({
    result: {
      ok: false,
      error: {
        type: ErrorType.MODE_RESTRICTED,
        message: `Tool ${call.name} not available in ${currentMode} mode`
      }
    }
  });
}
```

### Budget Exceeded
```javascript
if (retrievalCallsThisTurn > VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN) {
  await transport.sendToolResult({
    result: {
      ok: false,
      error: {
        type: ErrorType.BUDGET_EXCEEDED,
        message: `Voice retrieval budget exceeded`
      }
    }
  });
}
```

## Metrics and Observability

The voice service tracks:
- Tool execution duration
- Budget violations
- Loop detection
- Response metrics (for retrieval tools)
- Session-level tool call counts

See `tools/OBSERVABILITY.md` for details.

## Summary

The voice service accesses agent tools through:

1. **Registry Loading** (startup) - Loads `tool_registry.json`, compiles validators, imports handlers
2. **Session Configuration** - Injects tool docs into system prompt, declares tools to Gemini Live API
3. **Tool Call Parsing** - Transport layer normalizes Gemini Live API format
4. **Policy Enforcement** - Validates mode restrictions, budgets, loop detection
5. **Tool Execution** - Registry dispatches to handlers, validates responses
6. **Intent Application** - Updates session state based on tool results
7. **Result Transmission** - Transport layer sends results back to Gemini Live API

This architecture provides:
- ✅ **Provider-agnostic** tool execution (same registry for voice + text)
- ✅ **Type-safe** tool schemas (pre-computed at build time)
- ✅ **Policy enforcement** (budgets, modes, loops)
- ✅ **Observability** (metrics, logging, error tracking)
- ✅ **Low latency** (optimized for voice mode constraints)
