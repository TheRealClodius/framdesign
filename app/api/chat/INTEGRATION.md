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

## Integration Flow (To Be Implemented in Phase 4)

### 1. App Initialization

**Option A: Middleware (Recommended)**
```typescript
// middleware.ts or app initialization
import { toolRegistry } from '@/tools/_core/registry.js';

// Load registry at app startup
await toolRegistry.load();
toolRegistry.lock();
console.log(`✓ Tool registry loaded: v${toolRegistry.getVersion()}`);
```

**Option B: Route Handler**
```typescript
// app/api/chat/route.ts
import { toolRegistry } from '@/tools/_core/registry.js';

// Load registry once (cached module)
if (!toolRegistry.getVersion()) {
  await toolRegistry.load();
  toolRegistry.lock();
}
```

### 2. Get Provider Schemas

```typescript
// For OpenAI-compatible providers (OpenAI, Anthropic, etc.)
const tools = toolRegistry.getProviderSchemas('openai');

// Use in chat completion
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: tools,
  tool_choice: 'auto'
});
```

### 3. Tool Execution (Orchestrator Pattern)

```typescript
export async function POST(req: Request) {
  // ... setup ...

  // Initialize state controller
  const state = createStateController({
    mode: 'text',  // Explicit mode
    isActive: true
  });

  // Text mode budget
  const TEXT_BUDGET = {
    MAX_RETRIEVAL_CALLS_PER_TURN: 5,
    MAX_TOTAL_CALLS_PER_TURN: 10
  };

  // Handle tool calls from LLM
  if (response.choices[0].message.tool_calls) {
    let retrievalCallsThisTurn = 0;

    for (const toolCall of response.choices[0].message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      // Get tool metadata
      const toolMetadata = toolRegistry.getToolMetadata(toolName);

      if (!toolMetadata) {
        // Tool not found
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify({
            ok: false,
            error: {
              type: ErrorType.NOT_FOUND,
              message: `Unknown tool: ${toolName}`,
              retryable: false
            }
          })
        });
        continue;
      }

      // POLICY: Check mode restrictions
      if (!toolMetadata.allowedModes.includes('text')) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify({
            ok: false,
            error: {
              type: ErrorType.MODE_RESTRICTED,
              message: `Tool ${toolName} not available in text mode`,
              retryable: false
            }
          })
        });
        continue;
      }

      // POLICY: Enforce text retrieval budget
      if (toolMetadata.category === 'retrieval') {
        retrievalCallsThisTurn++;
        if (retrievalCallsThisTurn > TEXT_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({
              ok: false,
              error: {
                type: ErrorType.BUDGET_EXCEEDED,
                message: `Text retrieval budget exceeded (max ${TEXT_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN} per turn)`,
                retryable: false
              }
            })
          });
          continue;
        }
      }

      // POLICY: Check confirmation requirement
      if (toolMetadata.requiresConfirmation && !toolArgs.confirmationToken) {
        // Generate confirmation request
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify({
            ok: false,
            error: {
              type: ErrorType.CONFIRMATION_REQUIRED,
              message: 'This action requires user confirmation',
              confirmation_request: {
                token: generateConfirmationToken(toolCall),
                expires: Date.now() + 300000,
                tool: toolName,
                args: toolArgs,
                preview: generatePreview(toolName, toolArgs)
              }
            }
          })
        });
        continue;
      }

      // Build execution context
      const executionContext = {
        clientId: sessionId,
        ws: null,  // No WebSocket in text mode
        geminiSession: null,
        args: toolArgs,
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      };

      // Execute tool through registry
      const startTime = Date.now();
      const result = await toolRegistry.executeTool(toolName, executionContext);
      const duration = Date.now() - startTime;

      // Log execution
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
