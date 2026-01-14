/**
 * E2E tests for tool execution in text mode
 * Tests full tool execution flow with HTTP transport
 */

import { toolRegistry } from '../../../tools/_core/registry.js';
import { createStateController } from '../../../tools/_core/state-controller.js';
import { retryWithBackoff } from '../../../tools/_core/retry-handler.js';
import { ErrorType } from '../../../tools/_core/error-types.js';

describe('E2E: Tool Execution in Text Mode', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('start_voice_session tool', () => {
    test('should execute successfully in text mode', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      const result = await toolRegistry.executeTool('start_voice_session', {
        clientId: 'test-text-123',
        args: {},
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: false,
          messaging: true
        }
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });

    test('should reject in voice mode', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

      const metadata = toolRegistry.getToolMetadata('start_voice_session');
      
      // Check mode restriction
      expect(metadata.allowedModes).not.toContain('voice');
    });
  });

  describe('ignore_user tool', () => {
    test('should execute successfully in text mode', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      const result = await toolRegistry.executeTool('ignore_user', {
        clientId: 'test-text-123',
        args: {
          duration_seconds: 60,
          farewell_message: 'Goodbye'
        },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: false,
          messaging: true
        }
      });

      expect(result.ok).toBe(true);
      expect(result.data.durationSeconds).toBe(60);
      expect(result.data.farewellMessage).toBe('Goodbye');
    });
  });

  describe('retry logic', () => {
    test('should retry transient errors in text mode', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      const metadata = toolRegistry.getToolMetadata('kb_search');
      
      // Create a mock function that fails then succeeds
      let attempt = 0;
      const mockExecute = jest.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          // First attempt fails with transient error
          return {
            ok: false,
            error: {
              type: ErrorType.TRANSIENT,
              message: 'Network error',
              retryable: true
            },
            meta: {}
          };
        }
        // Second attempt succeeds
        return {
          ok: true,
          data: { results: [] },
          meta: {}
        };
      });

      const result = await retryWithBackoff(mockExecute, {
        mode: 'text',
        maxRetries: 3,
        toolId: 'kb_search',
        toolMetadata: metadata,
        clientId: 'test-text-123'
      });

      expect(result.ok).toBe(true);
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    test('should not retry in voice mode', async () => {
      const metadata = toolRegistry.getToolMetadata('kb_search');
      
      const mockExecute = jest.fn().mockResolvedValue({
        ok: false,
        error: {
          type: ErrorType.TRANSIENT,
          message: 'Network error',
          retryable: true
        },
        meta: {}
      });

      const result = await retryWithBackoff(mockExecute, {
        mode: 'voice',
        maxRetries: 3,
        toolId: 'kb_search',
        toolMetadata: metadata,
        clientId: 'test-voice-123'
      });

      expect(result.ok).toBe(false);
      expect(mockExecute).toHaveBeenCalledTimes(1); // No retries in voice mode
    });
  });
});
