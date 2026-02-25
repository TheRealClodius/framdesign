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
      expect(duration).toBeLessThan(5000);
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
      // Registry load is tracked as a tool execution under '_registry_load'
      expect(summary.tools['_registry_load']).toBeDefined();
      expect(summary.tools['_registry_load'].count).toBeGreaterThan(0);
    });

    test('should load registry within reasonable time', async () => {
      const summary = getMetricsSummary();
      const registryMetrics = summary.tools['_registry_load'];

      // Registry load should be under 10 seconds
      expect(registryMetrics.p50).toBeLessThan(10000);
    });
  });

  describe('Metrics Collection', () => {
    test('should collect execution metrics', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

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

      const summary = getMetricsSummary();
      expect(summary.tools).toBeDefined();
      expect(summary.tools['end_voice_session']).toBeDefined();
      expect(summary.tools['end_voice_session'].count).toBeGreaterThan(0);
    });

    test('should track latency percentiles', async () => {
      const summary = getMetricsSummary();

      const toolIds = Object.keys(summary.tools);
      if (toolIds.length > 0) {
        const toolId = toolIds[0];
        const toolMetrics = summary.tools[toolId];

        expect(toolMetrics.p50).toBeGreaterThanOrEqual(0);
        expect(toolMetrics.p95).toBeGreaterThanOrEqual(0);
        expect(toolMetrics.p99).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
