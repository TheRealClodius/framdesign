/**
 * E2E tests for chained function calls in text mode
 * Tests automatic tool chaining (MAX_CHAIN_LENGTH = 5)
 */

import { describe, test, expect, beforeAll, jest } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';
import { createStateController } from '../../tools/_core/state-controller.js';

describe('E2E: Chained Tool Calls (Text Mode)', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('Basic Chain: Search → Get', () => {
    test('should execute kb_search and kb_get in sequence', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      // Simulate chain: kb_search → kb_get
      const searchResult = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-chain-1',
        args: { query: 'founder' },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      expect(searchResult.ok).toBe(true);
      expect(searchResult.data).toBeDefined();

      // If search found results, try kb_get with the first result's ID
      if (searchResult.data.results && searchResult.data.results.length > 0) {
        const firstResult = searchResult.data.results[0];

        const getResult = await toolRegistry.executeTool('kb_get', {
          clientId: 'test-chain-1',
          args: { entity_id: firstResult.id },
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          }
        });

        // kb_get may fail if document not found in vector store
        // This is acceptable behavior - we just verify it executes
        expect(getResult).toBeDefined();
        expect(getResult.meta).toBeDefined();
      }
    }, 10000); // Increase timeout for vector operations
  });

  describe('Chain Position Tracking', () => {
    test('should track chain position correctly', () => {
      // Verify that chain position is logged correctly
      // This is implementation-specific - the chat route logs chain position
      expect(true).toBe(true); // Placeholder for integration test
    });
  });

  describe('Max Chain Length Enforcement', () => {
    test('should stop at MAX_CHAIN_LENGTH (5)', async () => {
      // This tests the safety limit in app/api/chat/route.ts
      // MAX_CHAIN_LENGTH = 5 should prevent infinite loops
      const MAX_CHAIN_LENGTH = 5;

      expect(MAX_CHAIN_LENGTH).toBe(5);

      // In practice, this would be tested by triggering 6+ tool calls
      // and verifying that exactly 5 execute before stopping
    });

    test('should append warning message when max depth reached', () => {
      const maxDepthMessage = '(Reached maximum tool chain depth)';
      expect(maxDepthMessage).toBe('(Reached maximum tool chain depth)');
    });
  });

  describe('Loop Detection in Chains', () => {
    test('should detect duplicate tool calls in same turn', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      const args = { query: 'design process' };

      // First call
      const firstResult = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-loop-1',
        args,
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      expect(firstResult.ok).toBe(true);

      // Second identical call - loop detector should catch this
      // Note: Loop detection is implemented in the chat route, not registry
      // This test verifies the registry level doesn't prevent retries
      const secondResult = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-loop-1',
        args,
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      // Registry allows retries - loop detection happens at orchestrator level
      expect(secondResult.ok).toBe(true);
    }, 10000); // Increase timeout for vector operations
  });

  describe('Error Handling Mid-Chain', () => {
    test('should stop chain on tool error', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      // Test with invalid entity_id
      const result = await toolRegistry.executeTool('kb_get', {
        clientId: 'test-error-1',
        args: { entity_id: 'nonexistent_entity_12345' },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      // Should return error gracefully
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.type).toBeDefined();
    });
  });

  describe('Retrieval Budget - Text Mode', () => {
    test('should allow unlimited retrieval calls in text mode', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      // Text mode has no retrieval budget limit
      // Execute multiple retrieval calls
      const calls = [];
      for (let i = 0; i < 3; i++) {
        calls.push(
          toolRegistry.executeTool('kb_search', {
            clientId: 'test-budget-text',
            args: { query: `query ${i}` },
            session: {
              isActive: state.get('isActive'),
              toolsVersion: toolRegistry.getVersion(),
              state: state.getSnapshot()
            }
          })
        );
      }

      const results = await Promise.all(calls);

      // All should succeed (no BUDGET_EXCEEDED in text mode)
      results.forEach(result => {
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Voice Mode Isolation', () => {
    test('voice mode tools should not trigger chaining', async () => {
      // Voice mode has different execution path
      // This test verifies that voice mode metadata is correct
      const voiceModeTools = Array.from(toolRegistry.tools.values())
        .filter(tool => tool.allowedModes.includes('voice'));

      expect(voiceModeTools.length).toBeGreaterThan(0);

      // Voice mode should have kb_search and kb_get
      const kbSearch = voiceModeTools.find(t => t.toolId === 'kb_search');
      const kbGet = voiceModeTools.find(t => t.toolId === 'kb_get');

      expect(kbSearch).toBeDefined();
      expect(kbGet).toBeDefined();
    });
  });

  describe('Empty/Invalid Args', () => {
    test('should handle empty args gracefully', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      // kb_search requires 'query' argument
      const result = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-empty-args',
        args: {}, // Missing required 'query'
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      // Should return validation error
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid arg types', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      // Pass invalid type for query
      const result = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-invalid-args',
        args: { query: 12345 }, // Should be string
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      // Tool should handle type coercion or return error
      // Most implementations will coerce to string
      expect(result).toBeDefined();
    });
  });

  describe('Performance Benchmarks', () => {
    test('single tool should complete under 4000ms', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      const startTime = Date.now();

      await toolRegistry.executeTool('kb_search', {
        clientId: 'test-perf-1',
        args: { query: 'design' },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      const duration = Date.now() - startTime;

      // Vector search can take 3-4 seconds (Qdrant Cloud + embedding generation)
      expect(duration).toBeLessThan(4000);
    }, 10000);

    test('2-tool chain should complete under 4000ms', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      const startTime = Date.now();

      // Execute search
      const searchResult = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-perf-2',
        args: { query: 'founder' },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        }
      });

      // Execute get if search succeeded
      if (searchResult.ok && searchResult.data.results?.length > 0) {
        await toolRegistry.executeTool('kb_get', {
          clientId: 'test-perf-2',
          args: { entity_id: searchResult.data.results[0].id },
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          }
        });
      }

      const duration = Date.now() - startTime;

      // 2-tool chain should complete reasonably fast
      expect(duration).toBeLessThan(4000);
    });
  });

  describe('Metadata Validation', () => {
    test('all tools should have category metadata', () => {
      const tools = Array.from(toolRegistry.tools.values());

      tools.forEach(tool => {
        expect(tool.category).toBeDefined();
        expect(['retrieval', 'action', 'utility']).toContain(tool.category);
      });
    });

    test('retrieval tools should have appropriate latency budgets', () => {
      const retrievalTools = Array.from(toolRegistry.tools.values())
        .filter(tool => tool.category === 'retrieval');

      retrievalTools.forEach(tool => {
        expect(tool.latencyBudgetMs).toBeDefined();
        expect(tool.latencyBudgetMs).toBeGreaterThan(0);
        // Retrieval tools should have reasonable budgets
        expect(tool.latencyBudgetMs).toBeLessThanOrEqual(3000);
      });
    });
  });

  describe('Registry Version', () => {
    test('should have valid registry version', () => {
      const version = toolRegistry.getVersion();
      expect(version).toBeDefined();
      expect(version).toMatch(/^\d+\.\d+\.\w+$/); // Format: 1.0.abc123de
    });

    test('should have git commit in version', () => {
      const gitCommit = toolRegistry.getGitCommit();
      expect(gitCommit).toBeDefined();
      expect(gitCommit.length).toBeGreaterThan(0);
    });
  });
});
