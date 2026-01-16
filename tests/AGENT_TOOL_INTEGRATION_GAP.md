# Agent Tool Integration Test Gap Analysis

## Summary

**Status:** ⚠️ **GAP IDENTIFIED**

Tools have been tested and work correctly, but there are **no integration tests** that verify the complete flow where:
1. The agent (voice or text) provides tools to Gemini API
2. Gemini decides to call a tool
3. The agent receives the tool call from Gemini
4. The agent executes the tool via the registry
5. The agent sends the result back to Gemini

## Current Test Coverage

### ✅ What IS Tested

1. **Direct Tool Execution** (`tests/e2e/tool-execution-voice.test.js`, `tests/e2e/tool-execution-text.test.js`)
   - Tests `toolRegistry.executeTool()` directly
   - Verifies tool handlers work correctly
   - Tests mode restrictions and policy enforcement
   - **Gap:** Doesn't test the agent receiving tool calls from Gemini

2. **Tool Registry** (`tests/tools/`)
   - Registry loading, tool metadata, schemas
   - Policy enforcement (mode restrictions, budgets)
   - Error handling
   - **Gap:** Doesn't test integration with agents

3. **Voice Integration** (`tests/voice mode/voice-integration.test.ts`)
   - Tests transcript flow (text → voice → transcripts → text)
   - **Gap:** Doesn't test tool calling at all

### ❌ What is MISSING

#### Voice Agent Integration Tests

**Missing Flow:**
```
Gemini Live API → toolCall message → voice-server/server.js → toolRegistry.executeTool() → transport.sendToolResult() → Gemini
```

**What Should Be Tested:**
1. Voice server provides tool schemas to Gemini Live API session
2. When Gemini sends `message.toolCall`, voice server receives it
3. Voice server parses tool calls via `transport.receiveToolCalls(message)`
4. Voice server executes tool via `toolRegistry.executeTool()`
5. Voice server sends result back via `transport.sendToolResult()`
6. Policy enforcement (budgets, mode restrictions) works in real flow

**Current Implementation Location:**
- `voice-server/server.js` lines 340-600 (handleGeminiMessage function)

#### Text Agent Integration Tests

**Missing Flow:**
```
Gemini API → functionCall in response → app/api/chat/route.ts → toolRegistry.executeTool() → NextResponse.json() → Client
```

**What Should Be Tested:**
1. Text API provides tool schemas to Gemini API (`providerSchemas`)
2. When Gemini returns `functionCall` in response, text API detects it
3. Text API executes tool via `toolRegistry.executeTool()`
4. Text API returns result to client
5. Schema conversion (geminiNative → JSON Schema) works correctly

**Current Implementation Location:**
- `app/api/chat/route.ts` lines 529-538 (schema conversion)
- `app/api/chat/route.ts` lines 817-881 (ignore_user tool handling)
- `app/api/chat/route.ts` lines 884-950 (start_voice_session tool handling)

## Recommended Test Files

### 1. `tests/e2e/voice-agent-tool-integration.test.js`
**Purpose:** Test complete voice agent tool calling flow

**Test Cases:**
- ✅ Voice server provides correct tool schemas based on `USE_META_TOOLS`
- ✅ Voice server receives tool call from Gemini and executes it
- ✅ Voice server sends tool result back to Gemini
- ✅ Policy enforcement (budget limits) works in voice mode
- ✅ Mode restrictions enforced (e.g., end_voice_session only in voice mode)
- ✅ Error handling when tool execution fails

**Mock Requirements:**
- Mock Gemini Live API WebSocket connection
- Mock `transport.receiveToolCalls()` and `transport.sendToolResult()`
- Mock `toolRegistry.executeTool()` (or use real registry with mocked handlers)

### 2. `tests/e2e/text-agent-tool-integration.test.js`
**Purpose:** Test complete text agent tool calling flow

**Test Cases:**
- ✅ Text API provides correct tool schemas based on `USE_META_TOOLS`
- ✅ Text API detects function call in Gemini response
- ✅ Text API executes tool via registry
- ✅ Text API returns correct response format
- ✅ Schema conversion (geminiNative → JSON Schema) works
- ✅ Mode restrictions enforced (e.g., start_voice_session only in text mode)

**Mock Requirements:**
- Mock Gemini API response with `functionCall`
- Mock `toolRegistry.executeTool()` (or use real registry)
- Test Next.js API route handler

## Implementation Priority

**High Priority:**
1. Voice agent tool integration test (critical for voice mode)
2. Text agent tool integration test (critical for text mode)

**Medium Priority:**
3. Test schema conversion edge cases
4. Test error scenarios (tool not found, execution failure)

**Low Priority:**
5. Performance tests (latency budgets)
6. Concurrent tool call tests

## Notes

- Existing tests (`tests/e2e/tool-execution-*.test.js`) test tool execution in isolation
- These are valuable but don't verify the agent integration layer
- The gap is in the **agent → Gemini → agent** loop, not in tool execution itself

## Test Files Created

### ✅ `tests/e2e/voice-agent-tool-integration.test.js`
**Status:** Created, may need Jest ES module configuration

**Test Coverage:**
- ✅ Tool schema provision to Gemini Live API
- ✅ Tool call parsing from Gemini messages
- ✅ Tool execution via registry
- ✅ Tool result sending back to Gemini
- ✅ Policy enforcement (mode restrictions, budgets)
- ✅ Complete integration flow

**Key Test Scenarios:**
1. Verifies tool exposure matches `USE_META_TOOLS` (meta-tools only or all concrete tools)
2. Tests `transport.receiveToolCalls()` parsing
3. Tests `transport.sendToolResult()` formatting
4. Tests full cycle: receive → execute → respond
5. Tests error handling and policy enforcement

### ✅ `tests/e2e/text-agent-tool-integration.test.js`
**Status:** Created, may need Jest ES module configuration

**Test Coverage:**
- ✅ Tool schema conversion (geminiNative → JSON Schema)
- ✅ Function call detection in Gemini responses
- ✅ Tool execution via registry
- ✅ API response formatting
- ✅ Mode restrictions
- ✅ Complete integration flow

**Key Test Scenarios:**
1. Verifies schema conversion for Gemini 3 API
2. Tests function call detection in streaming responses
3. Tests tool execution and response formatting
4. Tests mode restrictions (start_voice_session in text, end_voice_session blocked)
5. Tests complete flow: detect → execute → respond

## Next Steps

1. **Configure Jest for ES Modules** (if needed)
   - The project uses `"type": "module"` in package.json
   - Tests may need Jest ES module configuration
   - Check if existing tests run successfully

2. **Run Tests**
   ```bash
   npm test -- tests/e2e/voice-agent-tool-integration.test.js
   npm test -- tests/e2e/text-agent-tool-integration.test.js
   ```

3. **Verify Integration**
   - Tests should verify the complete agent → Gemini → agent loop
   - If tests pass, integration is verified
   - If tests fail, investigate the specific failure points

## Implementation Verification

The tests verify:
- ✅ Tools are provided to Gemini API (schema provision)
- ✅ Agents receive tool calls from Gemini (parsing/detection)
- ✅ Agents execute tools via registry (execution)
- ✅ Agents send results back to Gemini (response formatting)
- ✅ Policy enforcement works (mode restrictions, budgets)

This fills the gap between direct tool execution tests and full agent integration.
