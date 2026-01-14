/**
 * Metrics Collection
 *
 * Lightweight in-memory metrics collection for tool execution.
 * Tracks latency, error rates, budget violations, and registry load time.
 *
 * Usage:
 *   metrics.recordToolExecution('kb_search', 234, true);
 *   metrics.recordError('kb_search', ErrorType.TRANSIENT);
 *   metrics.recordBudgetViolation('kb_search', 500, 300);
 */

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
        }
      };
    }

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
 * Reset metrics
 */
export function resetMetrics() {
  metrics.reset();
}
