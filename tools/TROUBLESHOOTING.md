# Troubleshooting Guide

This guide helps diagnose and resolve common issues with the tool registry system.

## Table of Contents

1. [Common Issues](#common-issues)
2. [Debugging Tools](#debugging-tools)
3. [Performance Tuning](#performance-tuning)
4. [Error Recovery](#error-recovery)

## Common Issues

### Tool Not Found Errors

**Symptom:** `Tool <toolId> not found` error

**Possible Causes:**
- Tool registry not loaded
- Tool ID misspelled
- Tool not built/registered

**Solutions:**
1. Verify registry is loaded:
   ```javascript
   console.log('Registry version:', toolRegistry.getVersion());
   console.log('Tools loaded:', toolRegistry.tools.size);
   ```

2. Check tool registry file exists:
   ```bash
   ls -la tools/tool_registry.json
   ```

3. Rebuild tool registry:
   ```bash
   npm run build:tools
   ```

4. Verify tool ID matches exactly (case-sensitive):
   ```javascript
   const metadata = toolRegistry.getToolMetadata('exact_tool_id');
   console.log('Tool exists:', !!metadata);
   ```

### Validation Failures

**Symptom:** `Invalid parameters: <errors>` error

**Possible Causes:**
- Missing required parameters
- Wrong parameter types
- Parameter values outside allowed range/enum

**Solutions:**
1. Check tool schema:
   ```javascript
   const metadata = toolRegistry.getToolMetadata('tool_id');
   // Schema is in tool_registry.json
   ```

2. Verify parameter types match schema (string vs number, etc.)

3. Check enum values:
   ```javascript
   // For end_voice_session, reason must be: 'user_request', 'task_complete', or 'switch_to_text'
   ```

4. Review error details:
   ```javascript
   if (!result.ok && result.error.details) {
     console.log('Validation errors:', result.error.details);
   }
   ```

### Budget Exceeded Warnings

**Symptom:** `Tool <toolId> exceeded latency budget: Xms > Yms` warning

**Possible Causes:**
- Tool execution slower than expected
- Network latency
- External service delays
- Resource contention

**Solutions:**
1. Check metrics for patterns:
   ```javascript
   const summary = getMetricsSummary();
   const toolMetrics = summary.tools['tool_id'];
   console.log('P95 latency:', toolMetrics.latency.p95);
   console.log('Budget violations:', toolMetrics.budgetViolations);
   ```

2. Review tool implementation for optimization opportunities

3. Consider increasing latency budget if consistently exceeded:
   - Edit tool's `latencyBudgetMs` in tool definition
   - Rebuild registry: `npm run build:tools`

4. Check for external dependencies causing delays

### Retry Failures

**Symptom:** Tool fails after multiple retry attempts

**Possible Causes:**
- Non-retryable error (permanent failure)
- Partial side effects occurred
- Tool not idempotent but requires idempotency
- Network/service outage

**Solutions:**
1. Check error type:
   ```javascript
   if (result.error.type === ErrorType.PERMANENT) {
     // Don't retry - permanent failure
   }
   ```

2. Check retryable flag:
   ```javascript
   if (!result.error.retryable) {
     // Error is not retryable
   }
   ```

3. Verify tool idempotency:
   ```javascript
   const metadata = toolRegistry.getToolMetadata('tool_id');
   if (!metadata.idempotent && result.error.idempotencyRequired) {
     // Tool requires idempotency but isn't marked as idempotent
   }
   ```

4. Check for partial side effects:
   ```javascript
   if (result.error.partialSideEffects) {
     // Side effects occurred - manual intervention may be needed
   }
   ```

### Mode Restriction Violations

**Symptom:** `Tool <toolId> not available in <mode> mode` error

**Possible Causes:**
- Tool called in wrong mode (voice vs text)
- Tool metadata misconfigured

**Solutions:**
1. Check tool's allowed modes:
   ```javascript
   const metadata = toolRegistry.getToolMetadata('tool_id');
   console.log('Allowed modes:', metadata.allowedModes);
   ```

2. Verify current mode:
   ```javascript
   const currentMode = state.get('mode'); // 'voice' or 'text'
   ```

3. Use correct tool for mode:
   - Voice-only tools: `end_voice_session`
   - Text-only tools: `start_voice_session`
   - Both modes: `ignore_user`, `kb_search`

## Debugging Tools

### Structured Log Analysis

All tool executions are logged in JSON format:

```json
{
  "event": "tool_execution",
  "toolId": "kb_search",
  "toolVersion": "1.0.0",
  "registryVersion": "1.0.abc123",
  "duration": 234,
  "ok": true,
  "category": "retrieval",
  "sessionId": "1234567890-abc123",
  "mode": "voice"
}
```

**Analysis Tips:**
1. Filter by tool ID: `grep '"toolId": "kb_search"' logs.txt`
2. Find errors: `grep '"ok": false' logs.txt`
3. Find slow executions: `grep '"duration": [5-9][0-9][0-9][0-9]' logs.txt`
4. Track retries: `grep 'RetryHandler' logs.txt`

### Metrics Endpoint Usage

Access metrics via HTTP endpoint:

```bash
# Get all metrics
curl http://localhost:8080/metrics

# Get metrics since last hour (in milliseconds)
curl http://localhost:8080/metrics?since=3600000
```

**Metrics Structure:**
```json
{
  "status": "ok",
  "metrics": {
    "timestamp": 1234567890,
    "uptimeMs": 3600000,
    "registryLoadTimeMs": 234,
    "tools": {
      "kb_search": {
        "executionCount": 100,
        "errorCount": 5,
        "errorRate": 5.0,
        "errorBreakdown": {
          "TRANSIENT": 3,
          "PERMANENT": 2
        },
        "budgetViolations": 2,
        "budgetViolationRate": 2.0,
        "latency": {
          "p50": 200,
          "p95": 450,
          "p99": 800,
          "min": 50,
          "max": 1200,
          "avg": 250
        }
      }
    }
  }
}
```

### Registry Inspection

Inspect registry state:

```javascript
// Check registry version
console.log('Version:', toolRegistry.getVersion());
console.log('Git commit:', toolRegistry.getGitCommit());

// List all tools
for (const [toolId, tool] of toolRegistry.tools.entries()) {
  console.log(`${toolId}: v${tool.version} (${tool.category})`);
}

// Get tool metadata
const metadata = toolRegistry.getToolMetadata('kb_search');
console.log('Metadata:', JSON.stringify(metadata, null, 2));

// Get tool documentation
const docs = toolRegistry.getDocumentation('kb_search');
console.log('Documentation:', docs);
```

### State Controller Debugging

Inspect session state:

```javascript
// Get current state snapshot
const snapshot = state.getSnapshot();
console.log('State:', JSON.stringify(snapshot, null, 2));

// Check specific values
console.log('Mode:', state.get('mode'));
console.log('Is active:', state.get('isActive'));
console.log('Pending end session:', state.get('pendingEndVoiceSession'));
```

## Performance Tuning

### Latency Budget Optimization

**Goal:** Minimize budget violations while maintaining responsiveness

**Steps:**
1. Analyze current performance:
   ```javascript
   const summary = getMetricsSummary();
   const toolMetrics = summary.tools['tool_id'];
   console.log('P95 latency:', toolMetrics.latency.p95);
   console.log('Budget:', metadata.latencyBudgetMs);
   ```

2. Identify bottlenecks:
   - External API calls
   - Database queries
   - Network latency
   - Computation time

3. Optimize tool implementation:
   - Cache frequently accessed data
   - Use connection pooling
   - Parallelize independent operations
   - Reduce data transfer

4. Adjust budget if needed:
   - Edit `latencyBudgetMs` in tool definition
   - Rebuild registry

### Tool Execution Optimization

**Best Practices:**
1. **Minimize external calls:** Batch requests when possible
2. **Use appropriate timeouts:** Don't wait indefinitely
3. **Handle errors gracefully:** Fail fast for permanent errors
4. **Cache results:** Cache static or slowly-changing data
5. **Optimize data structures:** Use efficient algorithms

**Example:**
```javascript
// Bad: Multiple sequential calls
const result1 = await api.call1();
const result2 = await api.call2();
const result3 = await api.call3();

// Good: Parallel calls
const [result1, result2, result3] = await Promise.all([
  api.call1(),
  api.call2(),
  api.call3()
]);
```

### Registry Load Time Reduction

**Goal:** Minimize startup time

**Current State:**
- Registry load time tracked in metrics
- Typically < 1 second for 8 tools (meta-tool mode reduces schema payloads)

**Optimization Tips:**
1. Lazy load handlers (already implemented)
2. Minimize tool count (only include necessary tools)
3. Optimize JSON schema compilation
4. Use faster JSON parser if needed

**Check Load Time:**
```javascript
const summary = getMetricsSummary();
console.log('Registry load time:', summary.registryLoadTimeMs, 'ms');
```

## Error Recovery

### Understanding Error Types

**Registry Errors (Pre-execution):**
- `VALIDATION`: Invalid parameters - fix parameters and retry
- `NOT_FOUND`: Tool doesn't exist - check tool ID
- `INTERNAL`: Unexpected error - check logs, may need code fix

**Orchestrator Errors (Policy):**
- `MODE_RESTRICTED`: Tool not allowed in current mode - use different tool
- `BUDGET_EXCEEDED`: Budget limit reached - wait or optimize
- `CONFIRMATION_REQUIRED`: User confirmation needed - request confirmation

**Tool Handler Errors (Domain):**
- `SESSION_INACTIVE`: Session not active - activate session first
- `TRANSIENT`: Temporary failure - retry (automatic in text mode)
- `PERMANENT`: Permanent failure - don't retry, investigate cause
- `RATE_LIMIT`: Rate limit exceeded - wait and retry later
- `AUTH`: Authentication error - check credentials
- `CONFLICT`: Resource conflict - resolve conflict first

### When to Retry

**Retry Automatically:**
- `TRANSIENT` errors with `retryable: true`
- `RATE_LIMIT` errors (after delay)
- Tool is idempotent
- No partial side effects

**Don't Retry:**
- `PERMANENT` errors
- `VALIDATION` errors (fix parameters first)
- `AUTH` errors (fix credentials first)
- `CONFLICT` errors (resolve conflict first)
- Partial side effects occurred
- Tool not idempotent but requires idempotency

**Manual Retry:**
- After fixing underlying issue
- After user confirmation
- After resolving conflicts

### When to Escalate

**Escalate to Developer:**
- `INTERNAL` errors (unexpected)
- Repeated `PERMANENT` errors
- Registry load failures
- Handler crashes

**Escalate to Operations:**
- Service outages
- Rate limit exhaustion
- Authentication failures
- Performance degradation

**Escalate to User:**
- `CONFIRMATION_REQUIRED` errors
- `CONFLICT` errors requiring user action
- Permanent failures affecting user workflow

## Additional Resources

- [Tool Architecture Documentation](ARCHITECTURE.md)
- [Tool Authoring Guide](README.md)
- [Integration Guides](../app/api/chat/INTEGRATION.md)
- [Metrics API Documentation](../tools/_core/metrics.js)

## Getting Help

If you encounter issues not covered in this guide:

1. Check logs for detailed error messages
2. Review metrics for performance patterns
3. Inspect registry state for configuration issues
4. Consult architecture documentation
5. Check recent changes in git history
