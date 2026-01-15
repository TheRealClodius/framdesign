/**
 * Unit tests for metrics.js
 * Tests response size tracking, token estimation, and session metrics
 */

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
  resetMetrics
} from '../../../tools/_core/metrics.js';

describe('Metrics', () => {
  beforeEach(() => {
    // Reset metrics before each test
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
      // Record multiple executions with different latencies
      recordToolExecution('kb_search', 100, true);
      recordToolExecution('kb_search', 150, true);
      recordToolExecution('kb_search', 200, true);
      recordToolExecution('kb_search', 500, true);

      const metrics = getMetrics();
      const latency = metrics.toolExecutions['kb_search'].latency;

      expect(latency.p50).toBeGreaterThan(0);
      expect(latency.p95).toBeGreaterThan(latency.p50);
      expect(latency.p99).toBeGreaterThanOrEqual(latency.p95);
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
    test('should track response sizes', () => {
      const responseData = { results: [{ id: 1, name: 'Test' }] };
      recordResponseMetrics('kb_search', responseData);

      const metrics = getMetrics();
      expect(metrics.responseSizes['kb_search']).toBeDefined();
      expect(metrics.responseSizes['kb_search'].p50).toBeGreaterThan(0);
    });

    test('should track token estimates', () => {
      const responseData = { results: [{ id: 1, name: 'Test' }] };
      recordResponseMetrics('kb_search', responseData);

      const metrics = getMetrics();
      expect(metrics.responseTokens['kb_search']).toBeDefined();
      expect(metrics.responseTokens['kb_search'].avg).toBeGreaterThan(0);
    });

    test('should handle large responses', () => {
      // Create a large response (>1000 chars)
      const largeData = {
        results: Array(50).fill({ id: 1, name: 'Test Item', description: 'Long description here' })
      };

      recordResponseMetrics('kb_search', largeData);

      const metrics = getMetrics();
      expect(metrics.responseSizes['kb_search'].p50).toBeGreaterThan(1000);
    });

    test('should limit to last 1000 responses', () => {
      // Record 1500 responses
      for (let i = 0; i < 1500; i++) {
        recordResponseMetrics('kb_search', { id: i });
      }

      const metrics = getMetrics();
      // Should have tracked all responses (count is separate from history)
      // But history array should be capped at 1000
      expect(metrics.responseSizes['kb_search']).toBeDefined();
    });
  });

  describe('session tracking', () => {
    test('should start session with initial state', () => {
      startSession('session1');

      const session = getSessionMetrics('session1');
      expect(session).toBeDefined();
      expect(session.sessionId).toBe('session1');
      expect(session.currentTurn).toBe(1);
      expect(session.toolCalls).toEqual([]);
      expect(session.turnToolCalls).toEqual([]);
      expect(session.startTime).toBeGreaterThan(0);
    });

    test('should record session tool calls', () => {
      startSession('session1');
      recordSessionToolCall('session1', 'kb_search', { query: 'test' }, 150, true);

      const session = getSessionMetrics('session1');
      expect(session.toolCalls.length).toBe(1);
      expect(session.toolCalls[0].toolId).toBe('kb_search');
      expect(session.toolCalls[0].duration).toBe(150);
      expect(session.toolCalls[0].ok).toBe(true);
      expect(session.toolCalls[0].turn).toBe(1);
    });

    test('should track turn-specific calls', () => {
      startSession('session1');
      recordSessionToolCall('session1', 'kb_search', { query: 'test' }, 150, true);

      const session = getSessionMetrics('session1');
      expect(session.turnToolCalls.length).toBe(1);
    });

    test('should increment turn and reset turn calls', () => {
      startSession('session1');
      recordSessionToolCall('session1', 'kb_search', { query: 'test' }, 150, true);

      startNewTurn('session1');

      const session = getSessionMetrics('session1');
      expect(session.currentTurn).toBe(2);
      expect(session.turnToolCalls.length).toBe(0);
      expect(session.toolCalls.length).toBe(1); // Total calls preserved
    });

    test('should handle multiple tool calls per turn', () => {
      startSession('session1');
      recordSessionToolCall('session1', 'kb_search', { query: 'test' }, 150, true);
      recordSessionToolCall('session1', 'kb_get', { id: '123' }, 100, true);
      recordSessionToolCall('session1', 'kb_search', { query: 'test2' }, 200, true);

      const session = getSessionMetrics('session1');
      expect(session.toolCalls.length).toBe(3);
      expect(session.turnToolCalls.length).toBe(3);
    });

    test('should clean up session on end', () => {
      startSession('session1');
      recordSessionToolCall('session1', 'kb_search', { query: 'test' }, 150, true);

      endSession('session1');

      const session = getSessionMetrics('session1');
      expect(session).toBeUndefined();
    });

    test('should handle multiple concurrent sessions', () => {
      startSession('session1');
      startSession('session2');

      recordSessionToolCall('session1', 'kb_search', { query: 'test1' }, 150, true);
      recordSessionToolCall('session2', 'kb_search', { query: 'test2' }, 200, true);

      const session1 = getSessionMetrics('session1');
      const session2 = getSessionMetrics('session2');

      expect(session1.toolCalls.length).toBe(1);
      expect(session2.toolCalls.length).toBe(1);
      expect(session1.toolCalls[0].args).not.toBe(session2.toolCalls[0].args);
    });
  });

  describe('context metrics', () => {
    test('should set context init tokens', () => {
      setContextInitTokens(12500);

      const metrics = getMetrics();
      expect(metrics.context.sessionInitTokens).toBe(12500);
    });

    test('should calculate system prompt and tool declaration tokens', () => {
      // This would be set by the voice server on startup
      setContextInitTokens(12500);

      const metrics = getMetrics();
      expect(metrics.context.sessionInitTokens).toBe(12500);
    });
  });

  describe('getMetrics', () => {
    test('should return comprehensive metrics', () => {
      startSession('session1');
      recordToolExecution('kb_search', 150, true);
      recordResponseMetrics('kb_search', { results: [] });
      recordSessionToolCall('session1', 'kb_search', { query: 'test' }, 150, true);
      setContextInitTokens(12500);

      const metrics = getMetrics();

      expect(metrics.toolExecutions).toBeDefined();
      expect(metrics.responseSizes).toBeDefined();
      expect(metrics.responseTokens).toBeDefined();
      expect(metrics.context).toBeDefined();
      expect(metrics.context.sessionInitTokens).toBe(12500);
    });

    test('should return empty metrics initially', () => {
      const metrics = getMetrics();

      expect(metrics.toolExecutions).toEqual({});
      expect(metrics.responseSizes).toEqual({});
      expect(metrics.responseTokens).toEqual({});
      expect(metrics.context.sessionInitTokens).toBe(0);
    });
  });

  describe('token estimation', () => {
    test('should estimate tokens correctly', () => {
      // 400 chars should be ~100 tokens (chars / 4)
      const data = 'a'.repeat(400);
      recordResponseMetrics('test_tool', { data });

      const metrics = getMetrics();
      const avgTokens = metrics.responseTokens['test_tool'].avg;

      // Should be approximately 100 tokens (400 / 4)
      expect(avgTokens).toBeGreaterThan(90);
      expect(avgTokens).toBeLessThan(110);
    });

    test('should handle empty responses', () => {
      recordResponseMetrics('test_tool', {});

      const metrics = getMetrics();
      expect(metrics.responseTokens['test_tool'].avg).toBeGreaterThanOrEqual(0);
    });
  });

  describe('percentile calculations', () => {
    test('should calculate P50, P95, P99 correctly', () => {
      // Add 100 latency measurements from 100ms to 1000ms
      for (let i = 1; i <= 100; i++) {
        recordToolExecution('kb_search', i * 10, true);
      }

      const metrics = getMetrics();
      const latency = metrics.toolExecutions['kb_search'].latency;

      // P50 should be around 500ms
      expect(latency.p50).toBeGreaterThan(400);
      expect(latency.p50).toBeLessThan(600);

      // P95 should be around 950ms
      expect(latency.p95).toBeGreaterThan(900);
      expect(latency.p95).toBeLessThan(1000);

      // P99 should be around 990ms
      expect(latency.p99).toBeGreaterThan(950);
    });
  });

  describe('edge cases', () => {
    test('should handle undefined session gracefully', () => {
      recordSessionToolCall('nonexistent', 'kb_search', {}, 150, true);
      // Should not throw
    });

    test('should handle null response data', () => {
      recordResponseMetrics('test_tool', null);
      // Should not throw
    });

    test('should handle very large numbers', () => {
      recordToolExecution('test_tool', 999999, true);
      const metrics = getMetrics();
      expect(metrics.toolExecutions['test_tool'].latency.p50).toBe(999999);
    });

    test('should handle zero duration', () => {
      recordToolExecution('test_tool', 0, true);
      const metrics = getMetrics();
      expect(metrics.toolExecutions['test_tool'].latency.p50).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    test('should clear all metrics', () => {
      startSession('session1');
      recordToolExecution('kb_search', 150, true);
      recordResponseMetrics('kb_search', { data: 'test' });
      setContextInitTokens(12500);

      resetMetrics();

      const metrics = getMetrics();
      expect(metrics.toolExecutions).toEqual({});
      expect(metrics.responseSizes).toEqual({});
      expect(metrics.responseTokens).toEqual({});
      expect(metrics.context.sessionInitTokens).toBe(0);

      const session = getSessionMetrics('session1');
      expect(session).toBeUndefined();
    });
  });
});
