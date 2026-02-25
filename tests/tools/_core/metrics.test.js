/**
 * Unit tests for metrics.js
 * Tests the simplified metrics collector (single data structure)
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  recordToolExecution,
  recordResponseMetrics,
  startSession,
  endSession,
  recordSessionToolCall,
  startNewTurn,
  getMetrics,
  getSessionMetrics,
  setContextInitTokens,
  resetMetrics,
  getMetricsSummary
} from '../../../tools/_core/metrics.js';

describe('Metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('recordToolExecution', () => {
    test('should record successful tool execution', () => {
      recordToolExecution('kb_search', 150, true);

      const metrics = getMetrics();
      expect(metrics.toolExecutions['kb_search']).toBeDefined();
      expect(metrics.toolExecutions['kb_search'].count).toBe(1);
      expect(metrics.toolExecutions['kb_search'].successCount).toBe(1);
      expect(metrics.toolExecutions['kb_search'].failureCount).toBe(0);
      expect(metrics.toolExecutions['kb_search'].successRate).toBe(1);
    });

    test('should record failed tool execution', () => {
      recordToolExecution('kb_search', 150, false);

      const metrics = getMetrics();
      expect(metrics.toolExecutions['kb_search'].count).toBe(1);
      expect(metrics.toolExecutions['kb_search'].successCount).toBe(0);
      expect(metrics.toolExecutions['kb_search'].failureCount).toBe(1);
      expect(metrics.toolExecutions['kb_search'].successRate).toBe(0);
    });

    test('should track latency percentiles', () => {
      recordToolExecution('kb_search', 100, true);
      recordToolExecution('kb_search', 150, true);
      recordToolExecution('kb_search', 200, true);
      recordToolExecution('kb_search', 500, true);

      const metrics = getMetrics();
      const tool = metrics.toolExecutions['kb_search'];

      expect(tool.p50Latency).toBeGreaterThan(0);
      expect(tool.p95Latency).toBeGreaterThan(tool.p50Latency);
      expect(tool.p99Latency).toBeGreaterThanOrEqual(tool.p95Latency);
    });

    test('should calculate success rate correctly', () => {
      recordToolExecution('kb_search', 150, true);
      recordToolExecution('kb_search', 150, true);
      recordToolExecution('kb_search', 150, false);

      const metrics = getMetrics();
      expect(metrics.toolExecutions['kb_search'].successRate).toBeCloseTo(0.67, 2);
    });
  });

  describe('recordResponseMetrics', () => {
    test('should track response metrics without error', () => {
      const responseData = { results: [{ id: 1, name: 'Test' }] };
      recordResponseMetrics('kb_search', responseData);

      const metrics = getMetrics();
      // Response metrics are recorded as executions in the simplified collector
      expect(metrics.toolExecutions['kb_search']).toBeDefined();
    });

    test('should handle large responses', () => {
      const largeData = {
        results: Array(50).fill({ id: 1, name: 'Test Item', description: 'Long description here' })
      };

      recordResponseMetrics('kb_search', largeData);
      // Should not throw
      const metrics = getMetrics();
      expect(metrics.toolExecutions['kb_search']).toBeDefined();
    });

    test('should handle null response data', () => {
      recordResponseMetrics('test_tool', null);
      // Should not throw
    });
  });

  describe('session tracking', () => {
    test('should start session with initial state', () => {
      startSession();

      const session = getSessionMetrics();
      expect(session).toBeDefined();
      expect(session.turns).toBe(0);
      expect(session.contextTokens).toBe(0);
    });

    test('should record session tool calls', () => {
      startSession();
      recordSessionToolCall('kb_search', 150, true);

      const session = getSessionMetrics();
      expect(session.tools['kb_search']).toBeDefined();
      expect(session.tools['kb_search'].count).toBe(1);
      expect(session.tools['kb_search'].successCount).toBe(1);
    });

    test('should increment turn', () => {
      startSession();
      recordSessionToolCall('kb_search', 150, true);

      startNewTurn();

      const session = getSessionMetrics();
      expect(session.turns).toBe(1);
    });

    test('should handle multiple tool calls', () => {
      startSession();
      recordSessionToolCall('kb_search', 150, true);
      recordSessionToolCall('kb_get', 100, true);
      recordSessionToolCall('kb_search', 200, true);

      const session = getSessionMetrics();
      expect(session.tools['kb_search'].count).toBe(2);
      expect(session.tools['kb_get'].count).toBe(1);
    });

    test('should clean up session on end', () => {
      startSession();
      recordSessionToolCall('kb_search', 150, true);

      const result = endSession();
      expect(result).toBeDefined();

      // After end, session is reset
      const session = getSessionMetrics();
      expect(session.turns).toBe(0);
      expect(Object.keys(session.tools).length).toBe(0);
    });
  });

  describe('context metrics', () => {
    test('should set context init tokens', () => {
      setContextInitTokens(12500);

      const session = getSessionMetrics();
      expect(session.contextTokens).toBe(12500);
    });
  });

  describe('getMetrics', () => {
    test('should return comprehensive metrics', () => {
      recordToolExecution('kb_search', 150, true);

      const metrics = getMetrics();

      expect(metrics.toolExecutions).toBeDefined();
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.totalCalls).toBeGreaterThan(0);
    });

    test('should return empty metrics initially', () => {
      const metrics = getMetrics();

      expect(metrics.toolExecutions).toEqual({});
      expect(metrics.totalCalls).toBe(0);
    });
  });

  describe('getMetricsSummary', () => {
    test('should return summary (alias)', () => {
      recordToolExecution('kb_search', 150, true);

      const summary = getMetricsSummary();
      expect(summary).toBeDefined();
      expect(summary.tools).toBeDefined();
      expect(summary.totalCalls).toBe(1);
    });
  });

  describe('percentile calculations', () => {
    test('should calculate P50, P95, P99 correctly', () => {
      for (let i = 1; i <= 100; i++) {
        recordToolExecution('kb_search', i * 10, true);
      }

      const metrics = getMetrics();
      const tool = metrics.toolExecutions['kb_search'];

      // P50 should be around 500ms
      expect(tool.p50Latency).toBeGreaterThan(400);
      expect(tool.p50Latency).toBeLessThan(600);

      // P95 should be around 950ms
      expect(tool.p95Latency).toBeGreaterThan(900);
      expect(tool.p95Latency).toBeLessThan(1000);

      // P99 should be around 990ms
      expect(tool.p99Latency).toBeGreaterThan(950);
    });
  });

  describe('edge cases', () => {
    test('should handle very large numbers', () => {
      recordToolExecution('test_tool', 999999, true);
      const metrics = getMetrics();
      expect(metrics.toolExecutions['test_tool'].p50Latency).toBe(999999);
    });

    test('should handle zero duration', () => {
      recordToolExecution('test_tool', 0, true);
      const metrics = getMetrics();
      expect(metrics.toolExecutions['test_tool'].p50Latency).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    test('should clear all metrics', () => {
      recordToolExecution('kb_search', 150, true);
      setContextInitTokens(12500);

      resetMetrics();

      const metrics = getMetrics();
      expect(metrics.toolExecutions).toEqual({});
      expect(metrics.totalCalls).toBe(0);
    });
  });
});
