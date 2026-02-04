# Voice Server Tool Integration

## Overview

The voice server (`voice-server/server.js`) integrates with the shared tool registry and Gemini Live API to provide real-time voice conversations. The registry is loaded at startup and tool schemas are passed directly to Gemini Live.

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

```js
await toolRegistry.load();
if (process.env.NODE_ENV === 'development') {
  toolRegistry.watch(() => {
    geminiToolSchemas = toolRegistry.getProviderSchemas('geminiNative');
  });
} else {
  toolRegistry.lock();
}

geminiToolSchemas = toolRegistry.getProviderSchemas('geminiNative');
```

### 2. Session initialization

A Gemini Live session is created with tool schemas:

```js
geminiSession = await ai.live.connect({
  model: 'gemini-live-2.5-flash-native-audio',
  config: {
    responseModalities: [Modality.AUDIO],
    tools: [{ functionDeclarations: geminiToolSchemas }]
  }
});
```

### 3. Tool execution

- Tool calls are parsed via `GeminiLiveTransport.receiveToolCalls()`.
- Execution is gated by strict budgets and mode restrictions.
- Results are sent back using `GeminiLiveTransport.sendToolResult()`.
- **Important:** Gemini Live expects only `data` or `error`, not the full ToolResponse envelope.

## Voice Mode Constraints

- Max 2 retrieval calls per turn (hard gate)
- Max 3 total tool calls per turn (hard gate)
- Loop detection: same tool + args 3x, or empty results 2x in a single turn

## Auth & Provider

- Primary: Vertex AI Live (`VERTEXAI_PROJECT` + credentials)
- Fallback: AI Studio API key for non-live flows (no Live API support)

## See Also

- `voice-server/README.md` - setup and deployment
- `tools/ARCHITECTURE.md` - tool system internals
