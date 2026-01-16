# Chained Function Call Testing Plan

## Overview
Text mode now supports automatic tool chaining (up to 5 calls). This document outlines comprehensive tests to validate the feature.

---

## Test 1: Basic Search → Get Pattern

### Scenario
User asks about a person/project, agent chains `kb_search` → `kb_get`

### Test Steps
```
1. Start text chat
2. Send: "Tell me about the founder"
3. Expected chain:
   - kb_search(query="founder") → finds "person:andrei_clodius"
   - kb_get(entity_id="person:andrei_clodius") → gets full details
   - Responds with complete information
```

### Success Criteria
- ✅ Both tools executed automatically
- ✅ Chain position logged: `chainPosition: 1`, `chainPosition: 2`
- ✅ Final response includes complete details
- ✅ No visible tool calls to user (seamless)

---

## Test 2: Multiple Searches

### Scenario
User asks to compare two entities, agent chains multiple searches

### Test Steps
```
1. Start text chat
2. Send: "Compare Fram Design and UrbanAir"
3. Expected chain:
   - kb_search(query="Fram Design") → finds lab:fram_design
   - kb_get(entity_id="lab:fram_design")
   - kb_search(query="UrbanAir") → finds project:urban_air
   - kb_get(entity_id="project:urban_air")
   - Responds with comparison
```

### Success Criteria
- ✅ All 4 tools executed (within MAX_CHAIN_LENGTH=5)
- ✅ Chain positions logged correctly (1, 2, 3, 4)
- ✅ Final response compares both entities
- ✅ Total time < 10 seconds

---

## Test 3: Max Chain Depth (Safety Limit)

### Scenario
Trigger 6+ tool calls to verify safety limit

### Test Steps
```
1. Start text chat
2. Send message that might trigger 6+ tool calls
3. Expected behavior:
   - Executes first 5 tools
   - Stops at MAX_CHAIN_LENGTH
   - Logs warning: "Reached maximum chain length (5), stopping"
   - Appends to response: "(Reached maximum tool chain depth)"
```

### Success Criteria
- ✅ Exactly 5 tools executed
- ✅ Warning in logs
- ✅ User sees warning message
- ✅ Response is still coherent

---

## Test 4: Tool Error Mid-Chain

### Scenario
One tool fails during chain, verify graceful handling

### Test Steps
```
1. Modify kb_get to fail (temporarily)
2. Send: "Tell me about the founder"
3. Expected behavior:
   - kb_search succeeds
   - kb_get fails
   - Agent stops chain
   - Responds with what it has (search results only)
```

### Success Criteria
- ✅ Chain stops on error
- ✅ Error logged properly
- ✅ Response doesn't break
- ✅ User gets partial information or error message

---

## Test 5: Loop Detection in Chains

### Scenario
Agent tries to call same tool twice with same args

### Test Steps
```
1. Start text chat
2. Trigger scenario where agent might call kb_search twice with same query
3. Expected behavior:
   - First kb_search executes
   - Second kb_search detected as loop
   - Loop detector prevents execution
   - Error message sent
```

### Success Criteria
- ✅ Loop detected before execution
- ✅ Error type: LOOP_DETECTED
- ✅ Helpful message: "Try different search terms or a different tool"
- ✅ Chain stops (doesn't continue after loop)

### How to Test
```javascript
// Check loop detector logic
// In text mode, loop detection should track across chain steps
// Key: toolName + args
// If same call appears twice in one turn → loop
```

---

## Test 6: Retrieval Budget Interaction (Text Mode)

### Scenario
Verify retrieval budget doesn't block text mode chains

### Test Steps
```
1. Start text chat
2. Send: "Tell me about 3 different projects"
3. Expected chain:
   - kb_search(project1) → kb_get
   - kb_search(project2) → kb_get
   - kb_search(project3) → kb_get
   Total: 6 retrieval calls
4. Expected behavior:
   - All execute (text mode has no retrieval budget limit)
   - But stops at 5 due to MAX_CHAIN_LENGTH
```

### Success Criteria
- ✅ No BUDGET_EXCEEDED errors in text mode
- ✅ Voice mode STILL has retrieval budget (max 2)
- ✅ Retrieval budget only applies to voice

---

## Test 7: Voice Mode Isolation

### Scenario
Verify voice mode doesn't accidentally chain

### Test Steps
```
1. Start voice session
2. Say: "Tell me about the founder"
3. Expected behavior:
   - Agent calls kb_search
   - Sends tool result back to Gemini
   - Signals turnComplete
   - Gemini responds with audio (no chaining)
```

### Success Criteria
- ✅ No chained_tool_execution events in voice logs
- ✅ Only one turn of tool execution
- ✅ Response is single audio segment
- ✅ Natural conversation flow

---

## Test 8: Empty Function Call Args

### Scenario
Edge case: function call with missing/empty args

### Test Steps
```
1. Start text chat
2. Trigger scenario where model might call tool with empty args
3. Expected behavior:
   - Validation catches empty args
   - Error returned
   - Chain stops gracefully
```

### Success Criteria
- ✅ Validation error before execution
- ✅ Error type: VALIDATION (from registry)
- ✅ No crash or undefined behavior

---

## Test 9: Function Call + Text in Same Response

### Scenario
Gemini returns both function call AND text

### Test Steps
```
1. Start text chat
2. Send query that might trigger acknowledgment + tool call
3. Expected behavior:
   - Text portion streamed to user first
   - Then function call executed
   - Then follow-up response
```

### Success Criteria
- ✅ Text appears immediately
- ✅ Tool executes after text
- ✅ No duplicate text
- ✅ Natural conversation flow

---

## Test 10: Interrupted Chain (User Sends New Message)

### Scenario
User sends new message while chain is executing

### Test Steps
```
1. Start text chat
2. Send: "Tell me about Fram Design"
3. IMMEDIATELY send: "Never mind"
4. Expected behavior:
   - First chain may complete or be abandoned
   - Second message starts new conversation
   - No state corruption
```

### Success Criteria
- ✅ No errors or crashes
- ✅ Second message processed correctly
- ✅ No chain state leakage
- ✅ Logs show clear separation

---

## Performance Benchmarks

### Metrics to Track
1. **Chain Latency**:
   - Single tool: ~500ms
   - 2-tool chain: ~1-2s
   - 5-tool chain: ~3-5s

2. **Success Rate**:
   - Target: >95% of chains complete successfully
   - Tool execution errors handled gracefully

3. **Loop Detection**:
   - False positive rate: <1%
   - Detection rate: 100% for actual loops

---

## Logging Verification

### What to Check in Logs

**Chained Tool Execution:**
```json
{
  "event": "chained_tool_execution",
  "toolId": "kb_get",
  "chainPosition": 2,
  "toolVersion": "1.0.0",
  "registryVersion": "1.0.249a595d",
  "duration": 543,
  "ok": true,
  "category": "retrieval"
}
```

**Chain Completion:**
```
Final response streamed: 2847 bytes (after 2 chained calls)
```

**Max Depth Reached:**
```
Reached maximum chain length (5), stopping
```

---

## Manual Testing Prompts

Copy-paste these into text chat:

```
1. "Tell me about the founder"
   → Should chain: search → get

2. "What projects has Andrei worked on?"
   → Should chain: search(andrei) → get → possibly search(projects)

3. "Compare Fram Design with another design lab you know about"
   → Should chain: search(fram) → get → search(other) → get

4. "Tell me everything you know about urban mobility"
   → Should chain: search(urban mobility) → get(urban_air) → possibly more

5. "Who created this and what do they do?"
   → Should chain: search(creator/founder) → get(person) → respond
```

---

## Automated Test Cases

### Create Test File: `tests/e2e/chained-tool-calls.test.js`

```javascript
describe('Chained Tool Calls', () => {
  test('Basic search → get pattern', async () => {
    // Mock KB data
    // Send request
    // Verify chain executed
    // Check response includes full details
  });

  test('Max chain length enforced', async () => {
    // Trigger 6+ tool calls
    // Verify stops at 5
    // Check warning message
  });

  test('Loop detection prevents duplicate calls', async () => {
    // Mock loop scenario
    // Verify second identical call blocked
    // Check error message
  });

  test('Error handling mid-chain', async () => {
    // Mock tool failure
    // Verify chain stops
    // Check graceful degradation
  });
});
```

---

## Success Criteria Summary

✅ **Feature Complete:**
- Chains execute automatically up to 5 tools
- Natural conversation flow (user doesn't see intermediate steps)
- Proper error handling at each step

✅ **Safety:**
- MAX_CHAIN_LENGTH prevents infinite loops
- Loop detection catches duplicate calls
- Tool errors stop chain gracefully

✅ **Performance:**
- Chain latency scales linearly (~500ms per tool)
- Total chain time < 5-6 seconds for max depth
- Logs provide full observability

✅ **Compatibility:**
- Text mode has chaining
- Voice mode does NOT chain (correct behavior)
- Existing policies still enforced (mode restrictions, etc.)

---

## Next Steps

1. ✅ Run manual tests with prompts above
2. ✅ Create automated test suite
3. ✅ Monitor production logs for chain patterns
4. ✅ Tune MAX_CHAIN_LENGTH if needed (currently 5)
5. ✅ Consider adding chain depth to UI (optional)
