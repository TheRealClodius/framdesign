/**
 * Performance tests
 * Tests latency budgets, concurrent executions, registry load time
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';
import { createStateController } from '../../tools/_core/state-controller.js';
import { getMetricsSummary } from '../../tools/_core/metrics.js';

describe('E2E: Performance Tests', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('Latency Budget Compliance', () => {
    test('should track latency budgets for all tools', async () => {
      const tools = ['end_voice_session', 'ignore_user', 'kb_search', 'start_voice_session'];
      
      for (const toolId of tools) {
        const metadata = toolRegistry.getToolMetadata(toolId);
        expect(metadata).toBeTruthy();
        expect(metadata.latencyBudgetMs).toBeGreaterThan(0);
        expect(typeof metadata.latencyBudgetMs).toBe('number');
      }
    });

    test('should execute within reasonable time', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

      const startTime = Date.now();
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test-perf-123',
        geminiSession: {},
        args: {
          reason: 'user_request'
        },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true
        }
      });
      const duration = Date.now() - startTime;

      expect(result.ok).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Concurrent Executions', () => {
    test('should handle concurrent tool executions', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

      const executions = Array(5).fill(null).map(async () => {
        return toolRegistry.executeTool('end_voice_session', {
          clientId: `test-concurrent-${Math.random()}`,
          geminiSession: {},
          args: {
            reason: 'user_request'
          },
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          },
          capabilities: {
            voice: true
          }
        });
      });

      const results = await Promise.all(executions);
      
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.ok).toBe(true);
        expect(result.meta).toBeDefined();
      });
    });
  });

  describe('Registry Load Time', () => {
    test('should track registry load time in metrics', async () => {
      const summary = getMetricsSummary();
      
      expect(summary).toBeDefined();
      expect(summary.registryLoadTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof summary.registryLoadTimeMs).toBe('number');
    });

    test('should load registry within reasonable time', async () => {
      // Registry should already be loaded, but we can verify it's fast
      const summary = getMetricsSummary();
      
      // Registry load should be under 10 seconds (usually much faster)
      expect(summary.registryLoadTimeMs).toBeLessThan(10000);
    });
  });

  describe('Metrics Collection', () => {
    test('should collect execution metrics', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

      // Execute a tool
      await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test-metrics-123',
        geminiSession: {},
        args: {
          reason: 'user_request'
        },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true
        }
      });

      // Check metrics
      const summary = getMetricsSummary();
      expect(summary.tools).toBeDefined();
      expect(summary.tools['end_voice_session']).toBeDefined();
      expect(summary.tools['end_voice_session'].executionCount).toBeGreaterThan(0);
    });

    test('should track latency percentiles', async () => {
      const summary = getMetricsSummary();
      
      // Check if any tools have metrics
      const toolIds = Object.keys(summary.tools);
      if (toolIds.length > 0) {
        const toolId = toolIds[0];
        const toolMetrics = summary.tools[toolId];
        
        expect(toolMetrics.latency).toBeDefined();
        expect(toolMetrics.latency.p50).toBeGreaterThanOrEqual(0);
        expect(toolMetrics.latency.p95).toBeGreaterThanOrEqual(0);
        expect(toolMetrics.latency.p99).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
