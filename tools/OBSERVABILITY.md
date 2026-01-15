# Tools Observability Guide

Operational guide for monitoring, debugging, and optimizing the FRAM tool system.

## Overview

The tool system includes comprehensive observability features:
- **Loop Detection** - Prevents agents from getting stuck
- **Response Metrics** - Track tool performance and response sizes
- **Token Tracking** - Monitor context window usage
- **Session Tracking** - Debug agent behavior patterns

## Accessing Metrics

### Metrics Endpoint

```bash
curl http://localhost:8080/metrics
```

Returns JSON with current system metrics:

```json
{
  "registry": {
    "version": "1.0.abc123de",
    "toolCount": 5,
    "loadedAt": "2026-01-15T10:30:00.000Z"
  },
  "toolExecutions": {
    "kb_search": {
      "count": 1247,
      "successRate": 0.94,
      "latency": { "p50": 145, "p95": 320, "p99": 580 }
    },
    "kb_get": {
      "count": 423,
      "successRate": 0.97,
      "latency": { "p50": 89, "p95": 210, "p99": 445 }
    }
  },
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

### Health Check

```bash
curl http://localhost:8080/health
```

Returns:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "registry": { "loaded": true, "toolCount": 5 },
  "voiceServer": { "activeConnections": 2 }
}
```

## Loop Detection

### What It Detects

**1. Same Call Repeated (3x)**
Agent calls the same tool with identical arguments 3+ times in one turn.

**Example Scenario:**
```
Turn 1:
  - kb_search({ query: "AI researchers" })  ← Returns 5 results
  - kb_search({ query: "AI researchers" })  ← Same call, returns same 5 results
  - kb_search({ query: "AI researchers" })  ← LOOP DETECTED
```

**Agent Receives:**
```json
{
  "ok": false,
  "error": {
    "type": "LOOP_DETECTED",
    "message": "Loop detected: kb_search called 3 times with identical arguments. Try a different approach or rephrase your query.",
    "retryable": false,
    "details": {
      "loopType": "SAME_CALL_REPEATED",
      "count": 3
    }
  }
}
```

**2. Empty Results Repeated (2x)**
Tool returns empty/blank results 2+ times in one turn.

**Example Scenario:**
```
Turn 1:
  - kb_search({ query: "nonexistent topic" })  ← Returns empty results
  - kb_search({ query: "another missing topic" })  ← Returns empty results
  - kb_search({ query: "..." })  ← LOOP DETECTED
```

**Agent Receives:**
```json
{
  "ok": false,
  "error": {
    "type": "LOOP_DETECTED",
    "message": "kb_search returned empty results 2 times. Data may not exist. Try different search terms or a different tool.",
    "retryable": false,
    "details": {
      "loopType": "EMPTY_RESULTS_REPEATED",
      "count": 2
    }
  }
}
```

### What Counts as "Empty"?

```javascript
// These are considered empty:
{ ok: true, data: [] }
{ ok: true, data: {} }
{ ok: true, data: { results: [] } }
{ ok: true, data: "" }
{ ok: true, data: "   " }

// These are NOT empty:
{ ok: true, data: [{ id: 1 }] }
{ ok: true, data: { count: 0 } }  // Has content (count field)
{ ok: false, error: {...} }  // Errors don't count as empty
```

### Monitoring Loop Detection

**Check active sessions:**
```bash
curl http://localhost:8080/metrics | jq '.loopDetection'
```

**Expected output:**
```json
{
  "activeSessions": 3,
  "totalTurnsTracked": 47
}
```

**What to watch:**
- High `totalTurnsTracked` relative to sessions → agents making many turns
- May indicate agents struggling to complete tasks

### Debugging Loop Detection Issues

**Problem: Agent gets false positive loop detection**

**Cause:** Agent legitimately needs to call same tool multiple times (e.g., searching different entities)

**Solution:** Agent should vary arguments slightly:
```javascript
// Instead of:
kb_search({ query: "labs" })
kb_search({ query: "labs" })  // ← Triggers loop

// Do:
kb_search({ query: "labs" })
kb_search({ query: "research labs" })  // ← Different args, no loop
```

**Problem: Loop detection not triggering when it should**

**Cause:** Agent varies args slightly but intent is same (e.g., typos)

**Current behavior:** Loop detection uses exact argument matching (JSON.stringify comparison)

**Future improvement:** Could use semantic similarity for query arguments

## Response Size & Token Tracking

### Interpreting Response Metrics

**Response Size Percentiles:**
- **P50 (median):** Typical response size, most common case
- **P95:** Larger responses, expect ~5% of responses to be this size or larger
- **P99:** Outliers, rare but important to monitor

**Example interpretation:**
```json
"kb_search": { "p50": 320, "p95": 890, "p99": 1450 }
```
- Most searches return ~320 chars (80 tokens)
- 5% return 890+ chars (220+ tokens)
- 1% return 1450+ chars (360+ tokens)

**When to worry:**
- P95 > 2000 chars (500 tokens) → Tool may be too verbose
- P99 > 4000 chars (1000 tokens) → Check for outlier queries
- Growing trend over time → Data growth or query pattern change

### Token Estimation

**Formula:** `tokens ≈ chars / 4`

This is a rough estimate. Actual token count varies by:
- Language (English ~4 chars/token, code ~3 chars/token)
- Vocabulary (common words ~4-5 chars/token, rare words ~6-8)
- Format (JSON has overhead from brackets/quotes)

**Use estimates for:**
- Capacity planning
- Identifying oversized responses
- Context window monitoring

**Don't use estimates for:**
- Billing (use actual token counts from API)
- Precise context calculations (buffer 20-30%)

### Setting Up Alerts

**Recommended thresholds:**

```javascript
// Response size alerts
if (metrics.responseSizes[toolId].p95 > 2000) {
  console.warn(`Tool ${toolId} P95 response size exceeds 2000 chars`);
}

// Token alerts
if (metrics.responseTokens[toolId].p95 > 500) {
  console.warn(`Tool ${toolId} P95 tokens exceed 500`);
}

// Context window alerts
if (metrics.context.sessionInitTokens > 20000) {
  console.warn('Session init context exceeds 20k tokens');
}
```

## Context Window Monitoring

### What Gets Tracked

**At session initialization:**
```
[Context] Session init: ~12,847 tokens
  - System prompt: ~3,215 tokens
  - Tool declarations: ~9,632 tokens
```

**Components:**
1. **System prompt** (`voice-server/prompts/*.md`)
   - Core personality and instructions
   - Voice-specific behavior
   - Typically 3-4k tokens

2. **Tool declarations** (all tools combined)
   - Schema definitions
   - Full guide.md documentation
   - Typically 8-10k tokens for 5 tools (~1.6-2k per tool)

3. **Conversation history** (grows over session)
   - User messages + agent responses
   - Typically 200-500 tokens per turn
   - 10-20 turn conversation = 2-10k tokens

4. **Tool responses** (included in history)
   - Actual tool output data
   - Typically 100-500 tokens per tool call
   - 5-10 tool calls per session = 0.5-5k tokens

### Context Budget

**Gemini's limit:** 1,000,000 tokens

**Typical FRAM session:**
```
Session init:        ~15,000 tokens (cached)
20-turn conversation: ~5,000 tokens
10 tool calls:        ~2,000 tokens
Total:               ~22,000 tokens
Utilization:         2.2% of limit
```

**Max practical session:**
```
Session init:        ~15,000 tokens
100-turn conversation: ~30,000 tokens
50 tool calls:        ~15,000 tokens
Total:               ~60,000 tokens
Utilization:         6% of limit
```

**Safety margin:** Stay under 100k tokens per session for comfortable operation.

### When to Worry

**Yellow flags:**
- Session init > 20k tokens → Prompts or tool docs may be too verbose
- Average tool response > 500 tokens → Consider pagination or summarization
- Conversation > 50 turns → Unusual, may indicate confused agent

**Red flags:**
- Session init > 50k tokens → Major problem, investigate immediately
- Total session > 100k tokens → Risk of hitting limits on very long sessions
- Growing tool response sizes → Unbounded data growth

### Optimizing Context Usage

**1. Trim tool documentation**
- Keep guide.md concise
- Remove redundant examples
- Focus on "when to use" over "how it works"

**2. Implement response pagination**
```javascript
// Instead of returning all results:
{ ok: true, data: { results: [1000 items...] } }

// Return paginated:
{ ok: true, data: { results: [10 items], total: 1000, hasMore: true } }
```

**3. Summarize large responses**
```javascript
// For tools that return detailed data:
if (results.length > 10) {
  return {
    ok: true,
    data: {
      summary: `Found ${results.length} items`,
      topResults: results.slice(0, 10),
      hasMore: true
    }
  };
}
```

**4. Use intents to reduce verbosity**
```javascript
// Instead of returning full state in every response:
{
  ok: true,
  data: { status: "ignored", user: {...full user object...} }
}

// Return intent and minimal data:
{
  ok: true,
  data: { status: "ignored" },
  intents: [{ type: "SUPPRESS_TRANSCRIPT" }]
}
```

## Session Tracking

### Session Lifecycle

```javascript
// 1. Session starts
startSession(sessionId);
// Initializes: { sessionId, startTime, toolCalls: [], currentTurn: 1 }

// 2. Tool calls executed
recordSessionToolCall(sessionId, 'kb_search', args, 145, true);
// Records: toolId, args, duration (ms), success

// 3. Turn completes
startNewTurn(sessionId);
// Increments turn counter, resets turn-specific tracking

// 4. Session ends
endSession(sessionId);
// Cleanup: removes session from memory
```

### Session Metrics

**Access session data:**
```javascript
import { getSessionMetrics } from './tools/_core/metrics.js';

const session = getSessionMetrics(sessionId);
console.log(session);
```

**Example output:**
```json
{
  "sessionId": "1736960400-a7b3c2",
  "startTime": 1736960400000,
  "currentTurn": 12,
  "toolCalls": [
    {
      "toolId": "kb_search",
      "args": "{\"query\":\"AI researchers\"}",
      "timestamp": 1736960405000,
      "duration": 145,
      "ok": true,
      "turn": 1
    },
    {
      "toolId": "kb_get",
      "args": "{\"id\":\"person_123\"}",
      "timestamp": 1736960410000,
      "duration": 89,
      "ok": true,
      "turn": 1
    }
  ],
  "turnToolCalls": [
    // Current turn's calls only
  ]
}
```

### Debugging with Session Metrics

**Problem: Agent making too many tool calls**

**Debug:**
```javascript
const session = getSessionMetrics(sessionId);
console.log(`Turn ${session.currentTurn}: ${session.turnToolCalls.length} calls`);

// Check which tools
const toolCounts = {};
session.toolCalls.forEach(call => {
  toolCounts[call.toolId] = (toolCounts[call.toolId] || 0) + 1;
});
console.log('Tool usage:', toolCounts);
```

**Problem: Tool calls failing repeatedly**

**Debug:**
```javascript
const session = getSessionMetrics(sessionId);
const failures = session.toolCalls.filter(call => !call.ok);

console.log(`${failures.length} failures out of ${session.toolCalls.length} calls`);
failures.forEach(call => {
  console.log(`Turn ${call.turn}: ${call.toolId} failed`);
});
```

**Problem: Unusual performance degradation**

**Debug:**
```javascript
const session = getSessionMetrics(sessionId);
const avgDuration = session.toolCalls.reduce((sum, call) => sum + call.duration, 0) / session.toolCalls.length;

console.log(`Average tool duration: ${avgDuration}ms`);

// Check for outliers
const slowCalls = session.toolCalls.filter(call => call.duration > avgDuration * 2);
console.log(`${slowCalls.length} calls took 2x+ longer than average`);
```

## Common Monitoring Patterns

### Daily Health Check

```bash
#!/bin/bash
# daily-health-check.sh

echo "=== FRAM Tools Health Check ==="
echo

# 1. Check registry loaded
METRICS=$(curl -s http://localhost:8080/metrics)
TOOL_COUNT=$(echo $METRICS | jq '.registry.toolCount')
echo "Tools loaded: $TOOL_COUNT"

# 2. Check success rates
echo $METRICS | jq '.toolExecutions | to_entries[] | {tool: .key, successRate: .value.successRate}'

# 3. Check response sizes
echo "=== Response Sizes (P95) ==="
echo $METRICS | jq '.responseSizes | to_entries[] | {tool: .key, p95: .value.p95}'

# 4. Check context usage
echo "=== Context Usage ==="
echo $METRICS | jq '.context'

# 5. Check for loops
echo "=== Loop Detection ==="
echo $METRICS | jq '.loopDetection'
```

### Performance Regression Detection

```javascript
// Compare current metrics to baseline
import { getMetrics } from './tools/_core/metrics.js';

const current = getMetrics();
const baseline = loadBaseline(); // From file or DB

Object.keys(current.toolExecutions).forEach(toolId => {
  const curr = current.toolExecutions[toolId];
  const base = baseline.toolExecutions[toolId];

  // Check latency regression
  if (curr.latency.p95 > base.latency.p95 * 1.5) {
    console.warn(`REGRESSION: ${toolId} P95 latency increased ${((curr.latency.p95 / base.latency.p95 - 1) * 100).toFixed(1)}%`);
  }

  // Check success rate regression
  if (curr.successRate < base.successRate - 0.05) {
    console.warn(`REGRESSION: ${toolId} success rate dropped ${((base.successRate - curr.successRate) * 100).toFixed(1)}%`);
  }
});
```

### Real-time Monitoring

```javascript
// Watch metrics endpoint for changes
import { watch } from 'fs';

let lastMetrics = null;

setInterval(async () => {
  const response = await fetch('http://localhost:8080/metrics');
  const metrics = await response.json();

  if (lastMetrics) {
    // Alert on significant changes
    Object.keys(metrics.responseSizes).forEach(toolId => {
      const curr = metrics.responseSizes[toolId].p95;
      const last = lastMetrics.responseSizes[toolId].p95;

      if (curr > last * 1.5) {
        console.warn(`ALERT: ${toolId} P95 response size jumped ${((curr / last - 1) * 100).toFixed(1)}%`);
      }
    });
  }

  lastMetrics = metrics;
}, 60000); // Check every minute
```

## Troubleshooting

### High Response Sizes

**Symptoms:**
- P95 > 2000 chars for retrieval tools
- Context window usage growing faster than expected
- Voice mode latency increasing

**Diagnosis:**
```bash
curl http://localhost:8080/metrics | jq '.responseSizes'
```

**Solutions:**
1. Implement pagination in tool handlers
2. Summarize results before returning
3. Add voice-mode specific result limits (already done for kb_search top_k=3)
4. Review guide.md examples - are they too verbose?

### Loop Detection Triggering Too Often

**Symptoms:**
- Agents frequently hit LOOP_DETECTED errors
- Valid use cases being blocked

**Diagnosis:**
```bash
# Check loop detection frequency
curl http://localhost:8080/metrics | jq '.loopDetection'

# Review recent sessions (requires logging)
grep "LOOP_DETECTED" voice-server.log | tail -20
```

**Solutions:**
1. Adjust thresholds (currently 3x same call, 2x empty results)
2. Review prompt to encourage query variation
3. Add semantic similarity check instead of exact match (future enhancement)

### Context Window Growth

**Symptoms:**
- Session init tokens > 20k
- Voice server startup slower than expected

**Diagnosis:**
```bash
# Check context metrics
curl http://localhost:8080/metrics | jq '.context'

# Review tool documentation sizes
for tool in tools/*/guide.md; do
  echo "$tool: $(wc -c < "$tool") chars"
done
```

**Solutions:**
1. Trim verbose tool guides
2. Remove unnecessary examples
3. Consider extracting detailed docs to external reference

### Tool Execution Failures

**Symptoms:**
- Low success rate in metrics
- User reports tools not working

**Diagnosis:**
```bash
# Check success rates
curl http://localhost:8080/metrics | jq '.toolExecutions[] | {successRate}'

# Review error logs
grep "ToolError" voice-server.log | tail -50
```

**Solutions:**
1. Check error types (VALIDATION, INTERNAL, etc.)
2. Review tool handler error handling
3. Verify external dependencies (LanceDB, APIs)
4. Check schema validation rules

## Best Practices

### 1. Monitor Regularly
- Check `/metrics` daily
- Set up automated alerts for regressions
- Track trends over time (store metrics snapshots)

### 2. Baseline Everything
- Record metrics after each deployment
- Compare current to baseline to catch regressions
- Document expected ranges (e.g., kb_search P95: 800-1000 chars)

### 3. Optimize Incrementally
- Don't over-optimize early
- Focus on P95/P99 outliers first
- Measure impact of each optimization

### 4. Use Loop Detection as Signal
- High loop detection rate → improve prompts or tool design
- Low loop detection rate → consider if thresholds are too loose
- Track which tools trigger loops most often

### 5. Plan for Scale
- Current system handles 5 tools comfortably
- At 20+ tools, may need to optimize tool declaration sizes
- Consider lazy loading or tool categories for very large tool sets

## Future Enhancements

**Planned:**
- Prometheus/OpenTelemetry export
- Grafana dashboards
- Semantic similarity for loop detection
- Automated response size alerts
- Historical metrics storage

**Under consideration:**
- Tool usage analytics per user
- A/B testing framework for tool implementations
- Cost tracking per tool (API calls, compute time)
- Predictive context window alerts
