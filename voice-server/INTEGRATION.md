# Voice Server Tool Integration

## Overview

The voice server (WebSocket-based Gemini Live or OpenAI Realtime API) integrates with the shared tool registry to provide voice mode capabilities.

## Import Paths

### Core Registry
```javascript
import { toolRegistry } from '../tools/_core/registry.js';
```

### Error Types
```javascript
import { ErrorType, ToolError, IntentType } from '../tools/_core/error-types.js';
```

### State Controller
```javascript
import { createStateController } from '../tools/_core/state-controller.js';
```

### Transport Layer
```javascript
import { GeminiLiveTransport } from './providers/gemini-live-transport.js';
import { OpenAITransport } from './providers/openai-transport.js';
```

## Integration Flow (To Be Implemented in Phase 4)

### 1. Server Startup
```javascript
// Load registry once at startup
await toolRegistry.load();
console.log(`✓ Tool registry loaded: v${toolRegistry.getVersion()}`);

// Lock registry (no hot reload in production)
toolRegistry.lock();
```

### 2. Session Initialization
```javascript
wss.on('connection', async (ws, req) => {
  const clientId = generateClientId();

  // Pin registry version to this session (immutable)
  const sessionToolsVersion = toolRegistry.getVersion();
  const sessionToolsSnapshot = toolRegistry.snapshot();

  // Initialize state controller with explicit mode
  const state = createStateController({
    mode: 'voice',  // CRITICAL: Explicit, not inferred from geminiSession
    isActive: true,
    pendingEndVoiceSession: null,
    shouldSuppressAudio: false,
    shouldSuppressTranscript: false
  });

  // Initialize transport
  const transport = USE_GEMINI_LIVE
    ? new GeminiLiveTransport(geminiSession)
    : new OpenAITransport(client, conversationId);

  // Get provider-specific schemas
  const providerSchemas = toolRegistry.getProviderSchemas(
    USE_GEMINI_LIVE ? 'geminiNative' : 'openai'
  );

  // Configure session with tools
  const config = {
    // ... other config ...
    tools: [{ functionDeclarations: providerSchemas }]
  };
});
```

### 3. Tool Execution (Orchestrator Pattern)
```javascript
async function handleModelMessage(message) {
  // Receive tool calls via transport
  const toolCalls = transport.receiveToolCalls(message);

  // Voice budget tracking
  let retrievalCallsThisTurn = 0;
  const VOICE_BUDGET = {
    MAX_RETRIEVAL_CALLS_PER_TURN: 2,
    MAX_TOTAL_CALLS_PER_TURN: 3
  };

  for (const call of toolCalls) {
    // Get tool metadata for policy enforcement
    const toolMetadata = toolRegistry.getToolMetadata(call.name);

    if (!toolMetadata) {
      // Tool not found - send error via transport
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
      continue;
    }

    // POLICY: Check mode restrictions
    const currentMode = state.get('mode');
    if (!toolMetadata.allowedModes.includes(currentMode)) {
      await transport.sendToolResult({
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          error: {
            type: ErrorType.MODE_RESTRICTED,
            message: `Tool ${call.name} not available in ${currentMode} mode`,
            retryable: false
          }
        }
      });
      continue;
    }

    // POLICY: Enforce voice retrieval budget (HARD GATE)
    if (toolMetadata.category === 'retrieval') {
      retrievalCallsThisTurn++;
      if (retrievalCallsThisTurn > VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN) {
        await transport.sendToolResult({
          id: call.id,
          name: call.name,
          result: {
            ok: false,
            error: {
              type: ErrorType.BUDGET_EXCEEDED,
              message: `Voice retrieval budget exceeded (max ${VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN} per turn)`,
              retryable: false
            }
          }
        });
        continue;
      }
    }

    // POLICY: Check confirmation requirement
    if (toolMetadata.requiresConfirmation && !call.args.confirmationToken) {
      // Generate confirmation request
      await transport.sendToolResult({
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          error: {
            type: ErrorType.CONFIRMATION_REQUIRED,
            message: 'This action requires user confirmation',
            confirmation_request: {
              token: generateConfirmationToken(call),
              expires: Date.now() + 300000,
              tool: call.name,
              args: call.args,
              preview: generatePreview(call.name, call.args)
            }
          }
        }
      });
      continue;
    }

    // Build execution context
    const executionContext = {
      clientId,
      ws,
      geminiSession,
      args: call.args || {},
      session: {
        isActive: state.get('isActive'),
        toolsVersion: sessionToolsVersion,
        state: state.getSnapshot()
      }
    };

    // Execute tool through registry
    const startTime = Date.now();
    const result = await toolRegistry.executeTool(call.name, executionContext);
    const duration = Date.now() - startTime;

    // Log execution
    console.log(`[${clientId}] Tool executed: ${call.name} - ok: ${result.ok}, duration: ${duration}ms`);

    // POLICY: Warn if latency budget exceeded (SOFT LIMIT)
    if (duration > toolMetadata.latencyBudgetMs) {
      console.warn(`[${clientId}] Tool ${call.name} exceeded latency budget: ${duration}ms > ${toolMetadata.latencyBudgetMs}ms`);
    }

    // Apply intents if successful
    if (result.ok && result.intents) {
      for (const intent of result.intents) {
        state.applyIntent(intent);
      }
    }

    // Send result via transport (full ToolResponse envelope)
    await transport.sendToolResult({
      id: call.id,
      name: call.name,
      result: result
    });
  }
}
```

## Voice Mode Constraints

### Budget Limits
- **Max retrieval calls per turn:** 2 (HARD GATE - execution blocked)
- **Max total calls per turn:** 3
- **Latency budget:** Per-tool (SOFT LIMIT - logs warning)
  - Retrieval tools: 800ms target
  - Action tools: 1000-3000ms

### Prompt Optimization
- Tool summaries only (2-4 lines each)
- Full docs available on-demand
- Tight prompt for latency

### Mode Detection
- **CRITICAL:** Store `mode: 'voice'` explicitly at session creation
- **DO NOT** infer from geminiSession presence (original bug)

## Transport Layer

### Purpose
Abstract tool call/response protocol from provider-specific formats.

### Interface
```javascript
class ToolTransport {
  // Parse tool calls from model message
  receiveToolCalls(modelEvent) { /* Returns array of { id, name, args } */ }

  // Send tool result back to model
  async sendToolResult({ id, name, result }) { /* Sends full ToolResponse envelope */ }
}
```

### Implementations
- **GeminiLiveTransport** - WebSocket tool events (functionCalls format)
- **OpenAITransport** - Realtime API tool calls (tool_calls format)

### Critical Rule
**MUST send full ToolResponse envelope** - Do NOT strip to just `result.data`

Full envelope:
```javascript
{
  ok: true/false,
  data: {...} / error: {...},
  intents: [...],
  meta: {...}
}
```

## State Management

### State Controller
Replaces buggy value-passing applyIntent with proper reference mutation.

```javascript
const state = createStateController({
  mode: 'voice',
  isActive: true,
  pendingEndVoiceSession: null,
  shouldSuppressAudio: false
});

state.get('mode');  // 'voice'
state.set('mode', 'text');
state.applyIntent({ type: 'END_VOICE_SESSION', after: 'current_turn' });
```

### Intent Application
Tools return intents, orchestrator applies:
- `END_VOICE_SESSION` - Set pendingEndVoiceSession
- `SUPPRESS_AUDIO` - Set shouldSuppressAudio flag
- `SUPPRESS_TRANSCRIPT` - Set shouldSuppressTranscript flag

## Idempotency

### Hash-Based Fallback
When provider call.id missing/unstable, use content hash:

```javascript
function generateIdempotencyKey(call, sessionTurnId) {
  if (call.id && call.id.length > 8) {
    return `provider:${call.id}`;
  }

  // Canonical stringify for stable hashing
  const canonical = canonicalStringify({
    tool: call.name,
    args: call.args,
    turn: sessionTurnId
  });

  const hash = createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
    .substring(0, 16);

  return `hash:${hash}`;
}
```

## Structured Audit Logging

Log every tool execution:
```javascript
{
  event: 'tool_execution',
  toolId: 'kb_search',
  toolVersion: '1.0.0',
  registryVersion: '1.0.abc123de',
  duration: 450,
  ok: true,
  category: 'retrieval',
  sessionId: clientId,
  mode: 'voice'
}
```

## Implementation Status

**Phase 0:** ✅ Documentation complete
**Phase 3:** 🚧 Transport layer pending
**Phase 4:** 🚧 Orchestrator integration pending

## See Also

- `tools/ARCHITECTURE.md` - Overall system design
- `tools/README.md` - Tool authoring guide
- `tools/PHASES.md` - Implementation roadmap
- `voice-server/providers/` - Transport implementations (Phase 3)
