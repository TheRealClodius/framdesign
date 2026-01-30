/**
 * Simplified tool metrics collection
 * Uses single data structure instead of 8 parallel Maps
 */

const MAX_SAMPLES = 100;

class ToolMetrics {
  constructor() {
    this.samples = [];
  }

  record(execution) {
    this.samples.push({
      timestamp: Date.now(),
      duration: execution.duration,
      ok: execution.ok,
      errorType: execution.error?.type || null,
      responseSize: execution.responseSize || 0,
      tokenEstimate: execution.tokenEstimate || 0,
      budgetViolation: execution.budgetViolation || false
    });

    // Keep only last MAX_SAMPLES
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  getSummary() {
    if (this.samples.length === 0) {
      return { count: 0, avgDuration: 0, errorRate: 0, p50: 0, p95: 0, p99: 0 };
    }

    const durations = this.samples.map(s => s.duration).sort((a, b) => a - b);
    const errors = this.samples.filter(s => !s.ok).length;

    return {
      count: this.samples.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      errorRate: errors / this.samples.length,
      p50: durations[Math.floor(durations.length * 0.5)] || 0,
      p95: durations[Math.floor(durations.length * 0.95)] || 0,
      p99: durations[Math.floor(durations.length * 0.99)] || 0,
      budgetViolations: this.samples.filter(s => s.budgetViolation).length,
      recentErrors: this.samples.filter(s => !s.ok).slice(-5).map(s => s.errorType)
    };
  }
}

class MetricsCollector {
  constructor() {
    this.tools = new Map(); // toolId -> ToolMetrics
    this.globalStats = { totalCalls: 0, startTime: Date.now() };
  }

  getToolMetrics(toolId) {
    if (!this.tools.has(toolId)) {
      this.tools.set(toolId, new ToolMetrics());
    }
    return this.tools.get(toolId);
  }

  recordExecution(toolId, execution) {
    this.getToolMetrics(toolId).record(execution);
    this.globalStats.totalCalls++;
  }

  recordDuration(toolId, duration) {
    this.recordExecution(toolId, { duration, ok: true });
  }

  recordError(toolId, error, duration = 0) {
    this.recordExecution(toolId, { duration, ok: false, error });
  }

  recordBudgetViolation(toolId, duration, budgetMs) {
    this.recordExecution(toolId, { duration, ok: true, budgetViolation: true });
  }

  getSummary() {
    const toolSummaries = {};
    for (const [toolId, metrics] of this.tools) {
      toolSummaries[toolId] = metrics.getSummary();
    }

    return {
      uptime: Date.now() - this.globalStats.startTime,
      totalCalls: this.globalStats.totalCalls,
      tools: toolSummaries
    };
  }

  // Compatibility methods for existing code
  recordLatency(toolId, duration) {
    this.recordDuration(toolId, duration);
  }

  getLatencyStats(toolId) {
    return this.getToolMetrics(toolId).getSummary();
  }
}

// Export singleton instance
export const metrics = new MetricsCollector();

// Named exports for compatibility
export const recordLatency = (toolId, duration) => metrics.recordLatency(toolId, duration);
export const recordError = (toolId, error) => metrics.recordError(toolId, error);
export const recordBudgetViolation = (toolId, duration, budget) => metrics.recordBudgetViolation(toolId, duration, budget);
export const getLatencyStats = (toolId) => metrics.getLatencyStats(toolId);
export const getSummary = () => metrics.getSummary();

// Additional compatibility exports for registry.js
export const recordRegistryLoadTime = (duration) => {
  // Track registry load time as a special metric
  metrics.recordExecution('_registry_load', { duration, ok: true });
};

export const recordToolExecution = (toolId, duration, success) => {
  metrics.recordExecution(toolId, { duration, ok: success });
};
