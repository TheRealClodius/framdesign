# Text Agent Tool Integration

## Overview

The text agent lives in `app/api/chat/route.ts` and uses the shared tool registry to expose tools to Gemini 2.5 Flash. The runtime uses registry-provided Gemini Native schemas directly (no schema conversion). Tool docs are injected into the system prompt via `lib/prompt-loader.ts`.

Active tools (7):
- `kb_search` (retrieval)
- `kb_get` (retrieval)
- `perplexity_search` (retrieval)
- `query_tool_memory` (utility)
- `ignore_user` (action)
- `start_voice_session` (action, text-only)
- `end_voice_session` (action, voice-only)

## Integration Flow (Current)

### 1. Registry loading

The registry is loaded on first request and then locked:

```ts
if (!toolRegistry.getVersion()) {
  await toolRegistry.load();
  toolRegistry.lock();
}
```

### 2. Prompt + tool schemas

- System prompt is loaded from `prompts/core.md` plus tool guides from `tools/tool_registry.json`.
- Tool schemas come from `toolRegistry.getProviderSchemas('geminiNative')`.

If a Gemini cache is available, the request uses `cachedContent`. Otherwise it passes tools + system prompt:

```ts
const config: GeminiConfig = cachedContent
  ? { cachedContent }
  : {
      tools: [{ functionDeclarations: providerSchemas }],
      systemInstruction: FRAM_SYSTEM_PROMPT
    };
```

### 3. Tool execution

- Tool calls are detected in streamed chunks and executed via `toolRegistry.executeTool()`.
- Full ToolResponse envelopes are returned to the model in text mode.
- Tool memory features are applied:
- Dedup for retrieval tools (`toolMemoryDedup`)
- Loop detection (`loopDetector`)
- Summarization for older calls (`toolMemorySummarizer`)

### 4. Model-driven tool chaining

The model decides when to follow up `kb_search` with `kb_get` based on prompt guidance. There is no server-side auto-chaining; Gemini uses native parallel function calling when multiple tools are needed.

## Key Characteristics

- Model: `gemini-2.5-flash`
- Streaming responses with status markers (`---STATUS---` / `---ENDSTATUS---`)
- Message windowing + token budget enforcement (30k target)
- Conversation cache + system prompt cache via Gemini caches (best-effort)
- Global usage budget via `UsageService` (filesystem-backed `.usage/user-tokens.json`)

## Next.js Runtime Notes

- `next.config.ts` includes `outputFileTracingIncludes` so `tools/tool_registry.json` is available in serverless.
- Tool handlers are loaded via static import map in `tools/_core/registry.js` for bundler compatibility.

## See Also

- `tools/ARCHITECTURE.md` - tool system internals
- `tools/README.md` - tool authoring guide
- `voice-server/INTEGRATION.md` - voice agent integration
