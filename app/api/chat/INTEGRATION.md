# Text Agent Tool Integration

## Overview

The text agent (Next.js API route at `app/api/chat/route.ts`) integrates with the shared tool registry to provide text chat capabilities with any LLM provider (OpenAI, Anthropic, etc.).

## Import Paths

### Core Registry
```typescript
import { toolRegistry } from '@/tools/_core/registry.js';
```

**Note:** May need to configure Next.js to handle ESM imports from `tools/` directory. Check `next.config.js` if imports fail.

### Error Types
```typescript
import { ErrorType, ToolError, IntentType } from '@/tools/_core/error-types.js';
```

### State Controller
```typescript
import { createStateController } from '@/tools/_core/state-controller.js';
```

## Integration Flow ✅ (IMPLEMENTED)

### 1. Registry Loading

**Current Implementation:**
```typescript
// app/api/chat/route.ts
import { toolRegistry } from '@/tools/_core/registry.js';

export async function POST(request: Request) {
  // ... setup ...
  
  const ai = new GoogleGenAI({ apiKey });

  // Load registry if not already loaded (on first request)
  if (!toolRegistry.getVersion()) {
    await toolRegistry.load();
    toolRegistry.lock();
    console.log(`✓ Tool registry loaded: v${toolRegistry.getVersion()}`);
  }

  // Get provider schemas for Gemini 3
  const providerSchemas = toolRegistry.getProviderSchemas('geminiJsonSchema');
}
```

**Note:** Registry loads on first API request (Next.js on-demand loading). This is efficient and works correctly.

### 2. Schema Format

**Gemini 3 Compatibility:**
- Use the registry’s `geminiJsonSchema` provider view, which returns `{ name, description, parametersJsonSchema }`
- No integration-side schema conversion is required

### 3. Tool Usage in Gemini API

```typescript
// Use in Gemini generateContentStream
const config = {
  tools: [{ functionDeclarations: providerSchemas }],
  systemInstruction: FRAM_SYSTEM_PROMPT
};

const result = await ai.models.generateContentStream({
  model: 'gemini-3-flash-preview',
  contents: contentsToSend,
  config
});
```

### 3. Tool Execution (Orchestrator Pattern) ✅

**Current Implementation:**

```typescript
export async function POST(request: Request) {
  // ... setup ...

  // Check for function calls in early chunks
  if (functionCall?.name === "ignore_user") {
    // Initialize state controller
    const state = createStateController({
      mode: 'text',
      isActive: true
    }) as any;

    // Get tool metadata
    const toolMetadata = toolRegistry.getToolMetadata('ignore_user') as any;

    // Build execution context
    const executionContext = {
      clientId: `text-${Date.now()}`,
      ws: null,  // No WebSocket in text mode
      geminiSession: null,
      args: functionCall.args,
      session: {
        isActive: state.get('isActive'),
        toolsVersion: toolRegistry.getVersion(),
        state: state.getSnapshot()
      }
    };

    // Execute tool through registry
    const startTime = Date.now();
    const result = await toolRegistry.executeTool('ignore_user', executionContext);
    const duration = Date.now() - startTime;

    // Structured audit logging
    console.log(JSON.stringify({
      event: 'tool_execution',
      toolId: 'ignore_user',
      toolVersion: toolMetadata?.version || 'unknown',
      registryVersion: toolRegistry.getVersion(),
      duration,
      ok: result.ok,
      category: toolMetadata?.category || 'unknown',
      mode: 'text'
    }));

    // Return response based on result
    if (result.ok) {
      return NextResponse.json({
        message: result.data.farewellMessage || functionCall.args.farewell_message,
        timeout: {
          duration: result.data.durationSeconds || functionCall.args.duration_seconds,
          until: result.data.timeoutUntil
        }
      });
    } else {
      console.error('ignore_user tool failed:', result.error);
      return NextResponse.json({
        error: result.error.message
      }, { status: 500 });
    }
  }

  // Similar pattern for start_voice_session...
}
```

**Key Features:**
- ✅ State controller initialized per request
- ✅ Tool execution via `toolRegistry.executeTool()`
- ✅ Structured audit logging
- ✅ Proper error handling
- ✅ Tool result data extraction

**Note:** Budget enforcement and mode restrictions are handled by the registry's orchestrator pattern. Text mode has more flexible budgets than voice mode.
      console.log(`[${sessionId}] Tool executed: ${toolName} - ok: ${result.ok}, duration: ${duration}ms`);

      // POLICY: Warn if latency budget exceeded (SOFT LIMIT)
      if (duration > toolMetadata.latencyBudgetMs) {
        console.warn(`[${sessionId}] Tool ${toolName} exceeded latency budget: ${duration}ms > ${toolMetadata.latencyBudgetMs}ms`);
      }

      // Apply intents if successful
      if (result.ok && result.intents) {
        for (const intent of result.intents) {
          state.applyIntent(intent);
        }
      }

      // Add tool result to messages
      // CRITICAL: Send full ToolResponse envelope (not just result.data)
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolName,
        content: JSON.stringify(result)  // Full envelope
      });
    }

    // Continue conversation with tool results
    // ... recursive call or stream ...
  }

  // Return response
  // ...
}
```

## Text Mode Characteristics

### Budget Limits
- **Max retrieval calls per turn:** 5 (more flexible than voice)
- **Max total calls per turn:** 10
- **Latency budget:** Per-tool (SOFT LIMIT - logs warning)
  - Retrieval tools: 2s target
  - Action tools: 3-5s acceptable

### Prompt Optimization
- Tool summaries injected into system prompt
- Full docs can be included if needed (more token budget than voice)
- Can afford slightly larger prompts

### Mode Detection
- Store `mode: 'text'` explicitly in state controller
- No inference needed (no voice session)

## Next.js Configuration

### ESM Import Support

If imports from `tools/` fail, add to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['tools']
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx']
    };
    return config;
  }
};

export default nextConfig;
```

### TypeScript Configuration

Update `tsconfig.json` for path alias:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@/tools/*": ["./tools/*"]
    }
  }
}
```

## State Management

### State Controller
Same pattern as voice mode, but `mode: 'text'`:

```typescript
const state = createStateController({
  mode: 'text',
  isActive: true
});
```

### Intent Application
Tools can return intents (less common in text mode):
- No voice session to end
- Audio suppression not applicable
- Transcript suppression could apply to message visibility

## Idempotency

Text mode typically uses provider-supplied `tool_call_id`, which is stable. No need for hash-based fallback like voice mode.

```typescript
const idempotencyKey = `provider:${toolCall.id}`;
```

## Structured Audit Logging

Log every tool execution:
```typescript
{
  event: 'tool_execution',
  toolId: 'kb_search',
  toolVersion: '1.0.0',
  registryVersion: '1.0.abc123de',
  duration: 1200,
  ok: true,
  category: 'retrieval',
  sessionId: sessionId,
  mode: 'text'
}
```

## Provider Compatibility

### OpenAI
```typescript
const tools = toolRegistry.getProviderSchemas('openai');

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: tools,
  tool_choice: 'auto'
});
```

### Anthropic (Claude)
Anthropic uses similar format to OpenAI:
```typescript
const tools = toolRegistry.getProviderSchemas('openai');  // Same format

const message = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [...],
  tools: tools
});
```

### Other Providers
Most modern providers support OpenAI-compatible tool calling format. Use `'openai'` provider schemas.

## Streaming Responses

When streaming responses with tool calls:

```typescript
const stream = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: tools,
  stream: true
});

// Accumulate tool call deltas
// Execute tools when complete
// Stream tool results back
```

Tool execution happens between streaming chunks. Registry execution is synchronous from streaming perspective.

## Error Handling

Text mode can show more detailed errors to users:

```typescript
if (!result.ok) {
  const error = result.error;

  // User-facing error message
  const userMessage = formatErrorForUser(error);

  // Log full error for debugging
  console.error(`[${sessionId}] Tool error:`, error);

  // Return error in tool result (model can explain to user)
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: toolName,
    content: JSON.stringify(result)  // Full error envelope
  });
}
```

## Implementation Status

**Phase 0:** ✅ Documentation complete
**Phase 4:** 🚧 Orchestrator integration pending

## See Also

- `tools/ARCHITECTURE.md` - Overall system design
- `tools/README.md` - Tool authoring guide
- `tools/PHASES.md` - Implementation roadmap
- `voice-server/INTEGRATION.md` - Voice agent integration
