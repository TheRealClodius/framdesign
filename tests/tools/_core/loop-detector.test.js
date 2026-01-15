/**
 * Unit tests for loop-detector.js
 * Tests loop detection for repeated tool calls and empty results
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { LoopDetector } from '../../../tools/_core/loop-detector.js';

describe('LoopDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new LoopDetector();
  });

  describe('constructor', () => {
    test('should initialize empty detector', () => {
      expect(detector.turnHistory.size).toBe(0);
    });
  });

  describe('detectLoop - Same Call Repeated', () => {
    test('should not detect loop on first call', () => {
      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test' });

      expect(result.detected).toBe(false);
    });

    test('should not detect loop on second call', () => {
      // First call
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });

      // Second call - should not detect loop yet
      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test' });

      expect(result.detected).toBe(false);
    });

    test('should detect loop on third call with same args', () => {
      // First call
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });

      // Second call
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });

      // Third call - should detect loop
      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test' });

      expect(result.detected).toBe(true);
      expect(result.type).toBe('SAME_CALL_REPEATED');
      expect(result.message).toContain('kb_search called 3 times');
      expect(result.count).toBe(3);
    });

    test('should not detect loop for different arguments', () => {
      // First call with args1
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, { ok: true, data: [] });

      // Second call with args2
      detector.recordCall('session1', 1, 'kb_search', { query: 'test2' }, { ok: true, data: [] });

      // Third call with args3 - should not detect loop (different args)
      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test3' });

      expect(result.detected).toBe(false);
    });

    test('should not detect loop for different tools', () => {
      // Two calls to kb_search
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });

      // Third call to different tool - should not detect loop
      const result = detector.detectLoop('session1', 1, 'kb_get', { query: 'test' });

      expect(result.detected).toBe(false);
    });
  });

  describe('detectLoop - Empty Results Repeated', () => {
    test('should not detect loop on first empty result', () => {
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, { ok: true, data: [] });

      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test2' });

      expect(result.detected).toBe(false);
    });

    test('should detect loop on third empty result', () => {
      // First empty result
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, { ok: true, data: [] });

      // Second empty result
      detector.recordCall('session1', 1, 'kb_search', { query: 'test2' }, { ok: true, data: [] });

      // Third call - should detect loop (2 empty results already)
      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test3' });

      expect(result.detected).toBe(true);
      expect(result.type).toBe('EMPTY_RESULTS_REPEATED');
      expect(result.message).toContain('returned empty results 2 times');
      expect(result.count).toBe(2);
    });

    test('should detect loop for empty objects', () => {
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, { ok: true, data: {} });
      detector.recordCall('session1', 1, 'kb_search', { query: 'test2' }, { ok: true, data: {} });

      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test3' });

      expect(result.detected).toBe(true);
      expect(result.type).toBe('EMPTY_RESULTS_REPEATED');
    });

    test('should detect loop for results array pattern', () => {
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, {
        ok: true,
        data: { results: [] }
      });
      detector.recordCall('session1', 1, 'kb_search', { query: 'test2' }, {
        ok: true,
        data: { results: [] }
      });

      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test3' });

      expect(result.detected).toBe(true);
      expect(result.type).toBe('EMPTY_RESULTS_REPEATED');
    });

    test('should not count non-empty results', () => {
      // Empty result
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, { ok: true, data: [] });

      // Non-empty result
      detector.recordCall('session1', 1, 'kb_search', { query: 'test2' }, {
        ok: true,
        data: { results: [{ id: 1 }] }
      });

      // Third call - should not detect loop (only 1 empty)
      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test3' });

      expect(result.detected).toBe(false);
    });

    test('should not count errors as empty results', () => {
      // Error result
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, {
        ok: false,
        error: { type: 'VALIDATION', message: 'Invalid' }
      });

      // Empty result
      detector.recordCall('session1', 1, 'kb_search', { query: 'test2' }, { ok: true, data: [] });

      // Third call - should not detect loop (only 1 empty)
      const result = detector.detectLoop('session1', 1, 'kb_search', { query: 'test3' });

      expect(result.detected).toBe(false);
    });
  });

  describe('clearTurn', () => {
    test('should clear turn history', () => {
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });
      detector.recordCall('session1', 1, 'kb_get', { id: '123' }, { ok: true, data: {} });

      expect(detector.turnHistory.has('session1:1')).toBe(true);

      detector.clearTurn('session1', 1);

      expect(detector.turnHistory.has('session1:1')).toBe(false);
    });

    test('should keep last 5 turns per session', () => {
      // Add 10 turns
      for (let turn = 1; turn <= 10; turn++) {
        detector.recordCall('session1', turn, 'kb_search', { query: `test${turn}` }, {
          ok: true,
          data: []
        });
        detector.clearTurn('session1', turn);
      }

      // Should only have turns 6-10
      expect(detector.turnHistory.has('session1:1')).toBe(false);
      expect(detector.turnHistory.has('session1:5')).toBe(false);
      expect(detector.turnHistory.has('session1:6')).toBe(true);
      expect(detector.turnHistory.has('session1:10')).toBe(true);
    });
  });

  describe('clearSession', () => {
    test('should clear all turns for session', () => {
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, { ok: true, data: [] });
      detector.recordCall('session1', 2, 'kb_search', { query: 'test2' }, { ok: true, data: [] });
      detector.recordCall('session2', 1, 'kb_search', { query: 'test3' }, { ok: true, data: [] });

      expect(detector.turnHistory.has('session1:1')).toBe(true);
      expect(detector.turnHistory.has('session1:2')).toBe(true);
      expect(detector.turnHistory.has('session2:1')).toBe(true);

      detector.clearSession('session1');

      expect(detector.turnHistory.has('session1:1')).toBe(false);
      expect(detector.turnHistory.has('session1:2')).toBe(false);
      expect(detector.turnHistory.has('session2:1')).toBe(true);
    });
  });

  describe('getStats', () => {
    test('should return correct stats', () => {
      detector.recordCall('session1', 1, 'kb_search', { query: 'test1' }, { ok: true, data: [] });
      detector.recordCall('session1', 2, 'kb_search', { query: 'test2' }, { ok: true, data: [] });
      detector.recordCall('session2', 1, 'kb_search', { query: 'test3' }, { ok: true, data: [] });

      const stats = detector.getStats();

      expect(stats.activeSessions).toBe(2);
      expect(stats.totalTurnsTracked).toBe(3);
    });
  });

  describe('turn isolation', () => {
    test('should not detect loop across different turns', () => {
      // Turn 1: two calls
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });

      // Turn 2: third call with same args - should not detect loop (different turn)
      const result = detector.detectLoop('session1', 2, 'kb_search', { query: 'test' });

      expect(result.detected).toBe(false);
    });

    test('should not detect loop across different sessions', () => {
      // Session 1: two calls
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });
      detector.recordCall('session1', 1, 'kb_search', { query: 'test' }, { ok: true, data: [] });

      // Session 2: third call with same args - should not detect loop (different session)
      const result = detector.detectLoop('session2', 1, 'kb_search', { query: 'test' });

      expect(result.detected).toBe(false);
    });
  });

  describe('argument hashing', () => {
    test('should treat different argument orders as different', () => {
      // First call with args in one order
      detector.recordCall('session1', 1, 'kb_search', { a: 1, b: 2 }, { ok: true, data: [] });
      detector.recordCall('session1', 1, 'kb_search', { a: 1, b: 2 }, { ok: true, data: [] });

      // Third call with args in different order - may or may not detect (depends on JSON.stringify)
      // This test documents current behavior
      const result = detector.detectLoop('session1', 1, 'kb_search', { b: 2, a: 1 });

      // JSON.stringify is order-sensitive, so different order = different hash
      expect(result.detected).toBe(false);
    });

    test('should handle complex nested arguments', () => {
      const args1 = { query: 'test', filters: { tags: ['a', 'b'], type: 'person' } };
      const args2 = { query: 'test', filters: { tags: ['a', 'b'], type: 'person' } };

      detector.recordCall('session1', 1, 'kb_search', args1, { ok: true, data: [] });
      detector.recordCall('session1', 1, 'kb_search', args2, { ok: true, data: [] });

      const result = detector.detectLoop('session1', 1, 'kb_search', args2);

      expect(result.detected).toBe(true);
      expect(result.type).toBe('SAME_CALL_REPEATED');
    });
  });
});
