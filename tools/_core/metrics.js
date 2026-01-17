/**
 * Metrics Collection
 *
 * Lightweight in-memory metrics collection for tool execution.
 * Tracks latency, error rates, budget violations, registry load time,
 * response sizes, token estimates, per-session tracking, and context window usage.
 *
 * Usage:
 *   metrics.recordToolExecution('kb_search', 234, true);
 *   metrics.recordError('kb_search', ErrorType.TRANSIENT);
 *   metrics.recordBudgetViolation('kb_search', 500, 300);
 *   metrics.recordResponseMetrics('kb_search', responseData);
 *   metrics.startSession(sessionId);
 */

import { encoding_for_model } from 'tiktoken';

// Lazy-loaded encoder instance
let encoder = null;

/**
 * Get or create the token encoder instance
 */
function getEncoder() {
  if (!encoder) {
    // Use gpt-3.5-turbo as default model (uses cl100k_base encoding)
    encoder = encoding_for_model('gpt-3.5-turbo');
  }
  return encoder;
}

/**
 * Count tokens from text using tiktoken
 *
 * @param {string} text - Text to count tokens for
 * @returns {number} - Token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  try {
    const enc = getEncoder();
    return enc.encode(text).length;
  } catch (error) {
    // Fallback to character-based estimation if tiktoken fails
    console.warn('tiktoken failed, falling back to char estimation:', error);
    return Math.ceil(text.length / 4);
  }
}

/**
 * Metrics storage (in-memory)
 */
class MetricsStore {
  constructor() {
    // Tool execution durations (for percentile calculation)
    this.durations = new Map(); // toolId -> Array<number>

    // Error counts by tool and error type
    this.errors = new Map(); // toolId -> Map<errorType -> count>

    // Budget violations
    this.budgetViolations = new Map(); // toolId -> count

    // Registry load time
    this.registryLoadTime = null;

    // Total execution counts
    this.executionCounts = new Map(); // toolId -> count

    // Response size tracking (NEW)
    this.responseSizes = new Map(); // toolId -> Array<number> (chars)

    // Token estimates (NEW)
    this.responseTokenEstimates = new Map(); // toolId -> Array<number>

    // Per-session tracking (NEW)
    this.sessionMetrics = new Map(); // sessionId -> { startTime, toolCalls, currentTurn, turnToolCalls }

    // Context window metrics (NEW)
    this.contextMetrics = {
      sessionInitTokens: 0,
      avgToolResponseTokens: new Map(),
      peakContextUsage: 0
    };

    // Timestamp of first metric (for time-based queries)
    this.startTime = Date.now();
  }

  /**
   * Record tool execution
   *
   * @param {string} toolId - Tool identifier
   * @param {number} durationMs - Execution duration in milliseconds
   * @param {boolean} success - Whether execution succeeded
   */
  recordToolExecution(toolId, durationMs, success) {
    // Record duration
    if (!this.durations.has(toolId)) {
      this.durations.set(toolId, []);
    }
    this.durations.get(toolId).push(durationMs);
    
    // Keep only last 1000 durations per tool (to prevent memory growth)
    const durations = this.durations.get(toolId);
    if (durations.length > 1000) {
      durations.shift();
    }
    
    // Record execution count
    const count = this.executionCounts.get(toolId) || 0;
    this.executionCounts.set(toolId, count + 1);
  }

  /**
   * Record error
   *
   * @param {string} toolId - Tool identifier
   * @param {string} errorType - Error type from ErrorType enum
   */
  recordError(toolId, errorType) {
    if (!this.errors.has(toolId)) {
      this.errors.set(toolId, new Map());
    }
    
    const toolErrors = this.errors.get(toolId);
    const count = toolErrors.get(errorType) || 0;
    toolErrors.set(errorType, count + 1);
  }

  /**
   * Record budget violation
   *
   * @param {string} toolId - Tool identifier
   * @param {number} actualDuration - Actual duration in ms
   * @param {number} budgetMs - Budget in ms
   */
  recordBudgetViolation(toolId, actualDuration, budgetMs) {
    const count = this.budgetViolations.get(toolId) || 0;
    this.budgetViolations.set(toolId, count + 1);
  }

  /**
   * Record registry load time
   *
   * @param {number} loadTimeMs - Load time in milliseconds
   */
  recordRegistryLoadTime(loadTimeMs) {
    this.registryLoadTime = loadTimeMs;
  }

  /**
   * Record response metrics (NEW)
   *
   * @param {string} toolId - Tool identifier
   * @param {any} responseData - Response data
   */
  recordResponseMetrics(toolId, responseData) {
    const responseStr = JSON.stringify(responseData);
    const size = responseStr.length;
    const tokens = estimateTokens(responseStr);

    // Track response sizes (keep last 1000)
    if (!this.responseSizes.has(toolId)) {
      this.responseSizes.set(toolId, []);
    }
    const sizes = this.responseSizes.get(toolId);
    sizes.push(size);
    if (sizes.length > 1000) {
      sizes.shift();
    }

    // Track token estimates (keep last 1000)
    if (!this.responseTokenEstimates.has(toolId)) {
      this.responseTokenEstimates.set(toolId, []);
    }
    const tokenEstimates = this.responseTokenEstimates.get(toolId);
    tokenEstimates.push(tokens);
    if (tokenEstimates.length > 1000) {
      tokenEstimates.shift();
    }

    // Update average tool response tokens for context metrics
    if (tokenEstimates.length > 0) {
      const avg = tokenEstimates.reduce((a, b) => a + b, 0) / tokenEstimates.length;
      this.contextMetrics.avgToolResponseTokens.set(toolId, Math.round(avg));
    }
  }

  /**
   * Start session tracking (NEW)
   *
   * @param {string} sessionId - Session identifier
   */
  startSession(sessionId) {
    this.sessionMetrics.set(sessionId, {
      sessionId,
      startTime: Date.now(),
      toolCalls: [],
      currentTurn: 1,
      turnToolCalls: []
    });
  }

  /**
   * Record session tool call (NEW)
   *
   * @param {string} sessionId - Session identifier
   * @param {string} toolId - Tool identifier
   * @param {object} args - Tool arguments
   * @param {number} duration - Duration in ms
   * @param {boolean} ok - Success status
   */
  recordSessionToolCall(sessionId, toolId, args, duration, ok) {
    const session = this.sessionMetrics.get(sessionId);
    if (!session) return;

    const call = {
      toolId,
      args: JSON.stringify(args),
      timestamp: Date.now(),
      duration,
      ok,
      turn: session.currentTurn
    };

    session.toolCalls.push(call);
    session.turnToolCalls.push(call);
  }

  /**
   * Start new turn (NEW)
   *
   * @param {string} sessionId - Session identifier
   */
  startNewTurn(sessionId) {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.currentTurn++;
      session.turnToolCalls = [];
    }
  }

  /**
   * End session tracking (NEW)
   *
   * @param {string} sessionId - Session identifier
   */
  endSession(sessionId) {
    this.sessionMetrics.delete(sessionId);
  }

  /**
   * Get session metrics (NEW)
   *
   * @param {string} sessionId - Session identifier
   * @returns {object|null} - Session metrics or null
   */
  getSessionMetrics(sessionId) {
    return this.sessionMetrics.get(sessionId) || null;
  }

  /**
   * Set context window init tokens (NEW)
   *
   * @param {number} tokens - Estimated tokens
   */
  setContextInitTokens(tokens) {
    this.contextMetrics.sessionInitTokens = tokens;
  }

  /**
   * Update peak context usage (NEW)
   *
   * @param {number} tokens - Current context tokens
   */
  updatePeakContext(tokens) {
    if (tokens > this.contextMetrics.peakContextUsage) {
      this.contextMetrics.peakContextUsage = tokens;
    }
  }

  /**
   * Calculate percentile from array
   *
   * @param {Array<number>} values - Sorted array of values
   * @param {number} percentile - Percentile (0-100)
   * @returns {number} - Percentile value
   */
  calculatePercentile(values, percentile) {
    if (!values || values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get metrics summary
   *
   * @param {object} options - Options
   * @param {number} options.sinceMs - Only include metrics since this timestamp (default: all)
   * @returns {object} - Metrics summary
   */
  getSummary(options = {}) {
    const { sinceMs } = options;
    const now = Date.now();
    
    const summary = {
      timestamp: now,
      uptimeMs: now - this.startTime,
      registryLoadTimeMs: this.registryLoadTime,
      tools: {}
    };

    // Aggregate metrics per tool
    for (const [toolId, durations] of this.durations.entries()) {
      const executionCount = this.executionCounts.get(toolId) || 0;
      const errors = this.errors.get(toolId) || new Map();
      const budgetViolations = this.budgetViolations.get(toolId) || 0;
      
      // Calculate percentiles
      const p50 = this.calculatePercentile(durations, 50);
      const p95 = this.calculatePercentile(durations, 95);
      const p99 = this.calculatePercentile(durations, 99);
      
      // Calculate error rate
      let totalErrors = 0;
      const errorBreakdown = {};
      for (const [errorType, count] of errors.entries()) {
        totalErrors += count;
        errorBreakdown[errorType] = count;
      }
      
      const errorRate = executionCount > 0 ? (totalErrors / executionCount) * 100 : 0;
      const budgetViolationRate = executionCount > 0 ? (budgetViolations / executionCount) * 100 : 0;
      
      // Calculate response size percentiles (NEW)
      const sizes = this.responseSizes.get(toolId) || [];
      const tokenEstimates = this.responseTokenEstimates.get(toolId) || [];

      summary.tools[toolId] = {
        executionCount,
        errorCount: totalErrors,
        errorRate: parseFloat(errorRate.toFixed(2)),
        errorBreakdown,
        budgetViolations,
        budgetViolationRate: parseFloat(budgetViolationRate.toFixed(2)),
        latency: {
          p50,
          p95,
          p99,
          min: durations.length > 0 ? Math.min(...durations) : 0,
          max: durations.length > 0 ? Math.max(...durations) : 0,
          avg: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
        },
        responseSize: {
          p50: this.calculatePercentile(sizes, 50),
          p95: this.calculatePercentile(sizes, 95),
          p99: this.calculatePercentile(sizes, 99),
          avg: sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0
        },
        tokens: {
          p50: this.calculatePercentile(tokenEstimates, 50),
          p95: this.calculatePercentile(tokenEstimates, 95),
          p99: this.calculatePercentile(tokenEstimates, 99),
          avg: tokenEstimates.length > 0 ? Math.round(tokenEstimates.reduce((a, b) => a + b, 0) / tokenEstimates.length) : 0
        }
      };
    }

    // Add context and session metrics (NEW)
    summary.context = {
      sessionInitTokens: this.contextMetrics.sessionInitTokens,
      avgToolResponseTokens: Object.fromEntries(this.contextMetrics.avgToolResponseTokens),
      peakContextUsage: this.contextMetrics.peakContextUsage,
      geminiContextLimit: 1000000
    };

    summary.sessions = {
      activeCount: this.sessionMetrics.size,
      activeSessions: Array.from(this.sessionMetrics.keys())
    };

    return summary;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.durations.clear();
    this.errors.clear();
    this.budgetViolations.clear();
    this.executionCounts.clear();
    this.responseSizes.clear();
    this.responseTokenEstimates.clear();
    this.sessionMetrics.clear();
    this.contextMetrics = {
      sessionInitTokens: 0,
      avgToolResponseTokens: new Map(),
      peakContextUsage: 0
    };
    this.registryLoadTime = null;
    this.startTime = Date.now();
  }
}

// Singleton instance
export const metrics = new MetricsStore();

/**
 * Record tool execution metric
 *
 * @param {string} toolId - Tool identifier
 * @param {number} durationMs - Execution duration
 * @param {boolean} success - Success status
 */
export function recordToolExecution(toolId, durationMs, success) {
  metrics.recordToolExecution(toolId, durationMs, success);
}

/**
 * Record error metric
 *
 * @param {string} toolId - Tool identifier
 * @param {string} errorType - Error type
 */
export function recordError(toolId, errorType) {
  metrics.recordError(toolId, errorType);
}

/**
 * Record budget violation
 *
 * @param {string} toolId - Tool identifier
 * @param {number} actualDuration - Actual duration
 * @param {number} budgetMs - Budget
 */
export function recordBudgetViolation(toolId, actualDuration, budgetMs) {
  metrics.recordBudgetViolation(toolId, actualDuration, budgetMs);
}

/**
 * Record registry load time
 *
 * @param {number} loadTimeMs - Load time
 */
export function recordRegistryLoadTime(loadTimeMs) {
  metrics.recordRegistryLoadTime(loadTimeMs);
}

/**
 * Get metrics summary
 *
 * @param {object} options - Options
 * @returns {object} - Summary
 */
export function getMetricsSummary(options) {
  return metrics.getSummary(options);
}

/**
 * Get raw metrics object (for testing)
 *
 * @returns {object} - Raw metrics data
 */
export function getMetrics() {
  return metrics.getSummary();
}

/**
 * Reset metrics
 */
export function resetMetrics() {
  metrics.reset();
}

/**
 * Record response metrics (NEW)
 *
 * @param {string} toolId - Tool identifier
 * @param {any} responseData - Response data
 */
export function recordResponseMetrics(toolId, responseData) {
  metrics.recordResponseMetrics(toolId, responseData);
}

/**
 * Start session tracking (NEW)
 *
 * @param {string} sessionId - Session identifier
 */
export function startSession(sessionId) {
  metrics.startSession(sessionId);
}

/**
 * Record session tool call (NEW)
 *
 * @param {string} sessionId - Session identifier
 * @param {string} toolId - Tool identifier
 * @param {object} args - Tool arguments
 * @param {number} duration - Duration in ms
 * @param {boolean} ok - Success status
 */
export function recordSessionToolCall(sessionId, toolId, args, duration, ok) {
  metrics.recordSessionToolCall(sessionId, toolId, args, duration, ok);
}

/**
 * Start new turn (NEW)
 *
 * @param {string} sessionId - Session identifier
 */
export function startNewTurn(sessionId) {
  metrics.startNewTurn(sessionId);
}

/**
 * End session tracking (NEW)
 *
 * @param {string} sessionId - Session identifier
 */
export function endSession(sessionId) {
  metrics.endSession(sessionId);
}

/**
 * Get session metrics (NEW)
 *
 * @param {string} sessionId - Session identifier
 * @returns {object|null} - Session metrics or null
 */
export function getSessionMetrics(sessionId) {
  return metrics.getSessionMetrics(sessionId);
}

/**
 * Set context window init tokens (NEW)
 *
 * @param {number} tokens - Estimated tokens
 */
export function setContextInitTokens(tokens) {
  metrics.setContextInitTokens(tokens);
}

/**
 * Update peak context usage (NEW)
 *
 * @param {number} tokens - Current context tokens
 */
export function updatePeakContext(tokens) {
  metrics.updatePeakContext(tokens);
}
