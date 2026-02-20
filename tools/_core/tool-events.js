/**
 * Structured Tool Event Logger
 *
 * Emits structured JSON events for tool execution observability.
 * Captures full context of failures, dead assets, and diagnostic data
 * in a format suitable for log aggregation and alerting.
 *
 * Events are stored in a ring buffer (last N events) for:
 * - Runtime inspection via the metrics endpoint
 * - Pattern detection (e.g., repeated failures on same tool)
 * - Diagnostic dump on request
 */

const MAX_EVENTS = 200;
const events = [];

/**
 * @typedef {'tool_error' | 'dead_asset' | 'validation_failure' | 'loop_detected' | 'budget_violation' | 'hallucination_risk'} EventType
 */

/**
 * Emit a structured tool event
 *
 * @param {EventType} type - Event category
 * @param {object} payload - Event-specific data
 * @param {string} [payload.toolId] - Tool that triggered the event
 * @param {string} [payload.sessionId] - Session ID if available
 * @param {string} [payload.message] - Human-readable description
 * @param {object} [payload.details] - Additional structured data
 */
export function emitToolEvent(type, payload) {
  const event = {
    type,
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    ...payload,
  };

  // Store in ring buffer
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  // Structured JSON log line for log aggregation
  console.log(JSON.stringify({
    event: 'tool_event',
    ...event,
  }));
}

/**
 * Get recent events, optionally filtered
 *
 * @param {object} [filters]
 * @param {EventType} [filters.type] - Filter by event type
 * @param {string} [filters.toolId] - Filter by tool ID
 * @param {number} [filters.sinceMs] - Only events after this timestamp
 * @param {number} [filters.limit] - Max events to return (default: 50)
 * @returns {object[]} - Matching events (newest first)
 */
export function getRecentEvents(filters = {}) {
  let filtered = events;

  if (filters.type) {
    filtered = filtered.filter(e => e.type === filters.type);
  }
  if (filters.toolId) {
    filtered = filtered.filter(e => e.toolId === filters.toolId);
  }
  if (filters.sinceMs) {
    filtered = filtered.filter(e => e.timestamp >= filters.sinceMs);
  }

  const limit = filters.limit || 50;
  return filtered.slice(-limit).reverse();
}

/**
 * Get event summary statistics
 *
 * @returns {object} - Counts by event type and top offending tools
 */
export function getEventSummary() {
  const byType = {};
  const byTool = {};
  const last5min = Date.now() - 5 * 60 * 1000;

  for (const event of events) {
    // Count by type
    byType[event.type] = (byType[event.type] || 0) + 1;

    // Count errors by tool
    if (event.type === 'tool_error' && event.toolId) {
      byTool[event.toolId] = (byTool[event.toolId] || 0) + 1;
    }
  }

  // Recent events (last 5 min)
  const recentCount = events.filter(e => e.timestamp >= last5min).length;

  return {
    total: events.length,
    recent_5min: recentCount,
    by_type: byType,
    errors_by_tool: byTool,
  };
}

/**
 * Clear all events (useful for tests)
 */
export function clearEvents() {
  events.length = 0;
}
