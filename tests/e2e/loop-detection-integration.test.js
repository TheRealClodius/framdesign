/**
 * E2E tests for loop detection integration
 * Tests loop detection in realistic voice server scenarios
 */

import { toolRegistry } from '../../../tools/_core/registry.js';
import { loopDetector } from '../../../tools/_core/loop-detector.js';
import { createStateController } from '../../../tools/_core/state-controller.js';

describe('E2E: Loop Detection Integration', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  beforeEach(() => {
    // Clear loop detector between tests
    loopDetector.clearSession('test-session');
  });

  describe('Same call repeated scenario', () => {
    test('should allow first two identical calls', async () => {
      const sessionId = 'test-session-1';
      const turn = 1;
      const toolId = 'kb_search';
      const args = { query: 'AI researchers' };

      // First call
      let loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, args);
      expect(loopCheck.detected).toBe(false);

      const result1 = await toolRegistry.executeTool(toolId, {
        clientId: sessionId,
        args,
        session: {
          isActive: true,
          toolsVersion: toolRegistry.getVersion(),
          state: {}
        },
        capabilities: { voice: true, messaging: true }
      });

      loopDetector.recordCall(sessionId, turn, toolId, args, result1);

      // Second call
      loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, args);
      expect(loopCheck.detected).toBe(false);

      const result2 = await toolRegistry.executeTool(toolId, {
        clientId: sessionId,
        args,
        session: {
          isActive: true,
          toolsVersion: toolRegistry.getVersion(),
          state: {}
        },
        capabilities: { voice: true, messaging: true }
      });

      loopDetector.recordCall(sessionId, turn, toolId, args, result2);

      // Both should succeed
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });

    test('should detect loop on third identical call', () => {
      const sessionId = 'test-session-2';
      const turn = 1;
      const toolId = 'kb_search';
      const args = { query: 'AI researchers' };

      // Record two previous calls
      loopDetector.recordCall(sessionId, turn, toolId, args, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, turn, toolId, args, { ok: true, data: {} });

      // Third call should detect loop
      const loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, args);

      expect(loopCheck.detected).toBe(true);
      expect(loopCheck.type).toBe('SAME_CALL_REPEATED');
      expect(loopCheck.message).toContain('kb_search');
      expect(loopCheck.message).toContain('3 times');
      expect(loopCheck.count).toBe(3);
    });

    test('should provide helpful message to agent', () => {
      const sessionId = 'test-session-3';
      const turn = 1;
      const toolId = 'kb_search';
      const args = { query: 'nonexistent topic' };

      loopDetector.recordCall(sessionId, turn, toolId, args, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, turn, toolId, args, { ok: true, data: {} });

      const loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, args);

      expect(loopCheck.message).toContain('Try a different approach');
      expect(loopCheck.message).toContain('rephrase your query');
    });
  });

  describe('Empty results scenario', () => {
    test('should detect loop after two empty results', () => {
      const sessionId = 'test-session-4';
      const turn = 1;
      const toolId = 'kb_search';

      // First empty result
      loopDetector.recordCall(sessionId, turn, toolId, { query: 'query1' }, {
        ok: true,
        data: { results: [] }
      });

      // Second empty result
      loopDetector.recordCall(sessionId, turn, toolId, { query: 'query2' }, {
        ok: true,
        data: { results: [] }
      });

      // Third call should detect loop
      const loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, { query: 'query3' });

      expect(loopCheck.detected).toBe(true);
      expect(loopCheck.type).toBe('EMPTY_RESULTS_REPEATED');
      expect(loopCheck.message).toContain('empty results');
      expect(loopCheck.message).toContain('2 times');
    });

    test('should provide helpful suggestion for empty results', () => {
      const sessionId = 'test-session-5';
      const turn = 1;
      const toolId = 'kb_search';

      loopDetector.recordCall(sessionId, turn, toolId, { query: 'query1' }, {
        ok: true,
        data: []
      });

      loopDetector.recordCall(sessionId, turn, toolId, { query: 'query2' }, {
        ok: true,
        data: []
      });

      const loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, { query: 'query3' });

      expect(loopCheck.message).toContain('Data may not exist');
      expect(loopCheck.message).toContain('Try different search terms');
    });

    test('should not detect loop if results alternate empty/non-empty', () => {
      const sessionId = 'test-session-6';
      const turn = 1;
      const toolId = 'kb_search';

      // Empty
      loopDetector.recordCall(sessionId, turn, toolId, { query: 'query1' }, {
        ok: true,
        data: []
      });

      // Non-empty
      loopDetector.recordCall(sessionId, turn, toolId, { query: 'query2' }, {
        ok: true,
        data: { results: [{ id: 1 }] }
      });

      // Empty again
      loopDetector.recordCall(sessionId, turn, toolId, { query: 'query3' }, {
        ok: true,
        data: []
      });

      // Should not detect loop (only 2 empty results)
      const loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, { query: 'query4' });

      expect(loopCheck.detected).toBe(false);
    });
  });

  describe('Turn isolation', () => {
    test('should not detect loop across turn boundaries', () => {
      const sessionId = 'test-session-7';
      const toolId = 'kb_search';
      const args = { query: 'test' };

      // Turn 1: Two identical calls
      loopDetector.recordCall(sessionId, 1, toolId, args, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, 1, toolId, args, { ok: true, data: {} });

      // Turn 2: Third identical call (different turn)
      const loopCheck = loopDetector.detectLoop(sessionId, 2, toolId, args);

      expect(loopCheck.detected).toBe(false);
    });

    test('should reset turn history when turn advances', () => {
      const sessionId = 'test-session-8';
      const toolId = 'kb_search';

      // Turn 1: Some calls
      loopDetector.recordCall(sessionId, 1, toolId, { query: 'q1' }, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, 1, toolId, { query: 'q2' }, { ok: true, data: {} });

      // Clear turn 1
      loopDetector.clearTurn(sessionId, 1);

      // Turn 2: Same queries should not detect loop
      loopDetector.recordCall(sessionId, 2, toolId, { query: 'q1' }, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, 2, toolId, { query: 'q2' }, { ok: true, data: {} });

      const loopCheck = loopDetector.detectLoop(sessionId, 2, toolId, { query: 'q1' });
      expect(loopCheck.detected).toBe(false);
    });
  });

  describe('Multi-session isolation', () => {
    test('should not detect loop across different sessions', () => {
      const toolId = 'kb_search';
      const args = { query: 'test' };

      // Session 1: Two identical calls
      loopDetector.recordCall('session1', 1, toolId, args, { ok: true, data: {} });
      loopDetector.recordCall('session1', 1, toolId, args, { ok: true, data: {} });

      // Session 2: Third identical call (different session)
      const loopCheck = loopDetector.detectLoop('session2', 1, toolId, args);

      expect(loopCheck.detected).toBe(false);
    });

    test('should track multiple concurrent sessions independently', () => {
      const toolId = 'kb_search';
      const args = { query: 'test' };

      // Session 1: Two calls
      loopDetector.recordCall('session1', 1, toolId, args, { ok: true, data: {} });
      loopDetector.recordCall('session1', 1, toolId, args, { ok: true, data: {} });

      // Session 2: Two calls
      loopDetector.recordCall('session2', 1, toolId, args, { ok: true, data: {} });
      loopDetector.recordCall('session2', 1, toolId, args, { ok: true, data: {} });

      // Session 1 third call - should detect loop
      const loopCheck1 = loopDetector.detectLoop('session1', 1, toolId, args);
      expect(loopCheck1.detected).toBe(true);

      // Session 2 third call - should also detect loop
      const loopCheck2 = loopDetector.detectLoop('session2', 1, toolId, args);
      expect(loopCheck2.detected).toBe(true);
    });
  });

  describe('Different tools and arguments', () => {
    test('should not detect loop for different tools', () => {
      const sessionId = 'test-session-9';
      const turn = 1;
      const args = { query: 'test' };

      // Two kb_search calls
      loopDetector.recordCall(sessionId, turn, 'kb_search', args, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, turn, 'kb_search', args, { ok: true, data: {} });

      // Third call to different tool
      const loopCheck = loopDetector.detectLoop(sessionId, turn, 'kb_get', { id: '123' });

      expect(loopCheck.detected).toBe(false);
    });

    test('should not detect loop for different arguments', () => {
      const sessionId = 'test-session-10';
      const turn = 1;
      const toolId = 'kb_search';

      // Two calls with different args
      loopDetector.recordCall(sessionId, turn, toolId, { query: 'AI' }, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, turn, toolId, { query: 'ML' }, { ok: true, data: {} });

      // Third call with yet another arg
      const loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, { query: 'DL' });

      expect(loopCheck.detected).toBe(false);
    });

    test('should detect loop only for exact argument matches', () => {
      const sessionId = 'test-session-11';
      const turn = 1;
      const toolId = 'kb_search';

      // Two calls with query "AI researchers"
      const args1 = { query: 'AI researchers' };
      loopDetector.recordCall(sessionId, turn, toolId, args1, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, turn, toolId, args1, { ok: true, data: {} });

      // Third call with slightly different query
      const args2 = { query: 'AI researcher' }; // Singular, not plural
      const loopCheck = loopDetector.detectLoop(sessionId, turn, toolId, args2);

      expect(loopCheck.detected).toBe(false);
    });
  });

  describe('Cleanup behavior', () => {
    test('should clean up old turns automatically', () => {
      const sessionId = 'test-session-12';
      const toolId = 'kb_search';

      // Create 10 turns
      for (let turn = 1; turn <= 10; turn++) {
        loopDetector.recordCall(sessionId, turn, toolId, { query: `test${turn}` }, {
          ok: true,
          data: {}
        });
        loopDetector.clearTurn(sessionId, turn);
      }

      // Only last 5 turns should be retained
      const stats = loopDetector.getStats();
      expect(stats.totalTurnsTracked).toBeLessThanOrEqual(5);
    });

    test('should clean up entire session', () => {
      const sessionId = 'test-session-13';
      const toolId = 'kb_search';

      // Record several calls across multiple turns
      loopDetector.recordCall(sessionId, 1, toolId, { query: 'test1' }, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, 2, toolId, { query: 'test2' }, { ok: true, data: {} });
      loopDetector.recordCall(sessionId, 3, toolId, { query: 'test3' }, { ok: true, data: {} });

      // Clear session
      loopDetector.clearSession(sessionId);

      // No loop should be detected (history cleared)
      const loopCheck = loopDetector.detectLoop(sessionId, 4, toolId, { query: 'test1' });
      expect(loopCheck.detected).toBe(false);
    });
  });

  describe('Voice server integration workflow', () => {
    test('should integrate with typical voice server flow', async () => {
      const sessionId = 'voice-session-1';
      const turn = 1;

      // Simulate voice server workflow
      const toolCalls = [
        { name: 'kb_search', args: { query: 'robotics' } },
        { name: 'kb_search', args: { query: 'robotics' } }, // Repeated
        { name: 'kb_search', args: { query: 'robotics' } }  // Loop!
      ];

      for (let i = 0; i < toolCalls.length; i++) {
        const call = toolCalls[i];

        // Check for loop before execution
        const loopCheck = loopDetector.detectLoop(sessionId, turn, call.name, call.args);

        if (loopCheck.detected) {
          // Voice server would return error to agent
          expect(i).toBe(2); // Should detect on 3rd call
          expect(loopCheck.type).toBe('SAME_CALL_REPEATED');
          break;
        }

        // Execute tool
        const result = await toolRegistry.executeTool(call.name, {
          clientId: sessionId,
          args: call.args,
          session: {
            isActive: true,
            toolsVersion: toolRegistry.getVersion(),
            state: {}
          },
          capabilities: { voice: true, messaging: true }
        });

        // Record call for loop detection
        loopDetector.recordCall(sessionId, turn, call.name, call.args, result);
      }
    });

    test('should reset on new turn', () => {
      const sessionId = 'voice-session-2';

      // Turn 1: Two identical calls
      loopDetector.recordCall(sessionId, 1, 'kb_search', { query: 'test' }, {
        ok: true,
        data: {}
      });
      loopDetector.recordCall(sessionId, 1, 'kb_search', { query: 'test' }, {
        ok: true,
        data: {}
      });

      // Voice server signals turn complete
      loopDetector.clearTurn(sessionId, 1);

      // Turn 2: Same query should not trigger loop
      const loopCheck = loopDetector.detectLoop(sessionId, 2, 'kb_search', { query: 'test' });
      expect(loopCheck.detected).toBe(false);
    });
  });
});
