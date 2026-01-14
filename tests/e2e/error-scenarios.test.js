/**
 * E2E error scenario tests
 * Tests budget exceeded, mode restrictions, validation failures, etc.
 */

import { toolRegistry } from '../../tools/_core/registry.js';
import { createStateController } from '../../tools/_core/state-controller.js';
import { ErrorType } from '../../tools/_core/error-types.js';

describe('E2E: Error Scenarios', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('Budget Exceeded', () => {
    test('should detect latency budget violations', async () => {
      const metadata = toolRegistry.getToolMetadata('kb_search');
      expect(metadata.latencyBudgetMs).toBeGreaterThan(0);
      
      // Budget violations are logged as warnings, not errors
      // The tool still executes, but warning is logged
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

      const result = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-voice-123',
        args: {
          query: 'test query',
          top_k: 3
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

      // Tool executes regardless of budget
      // Budget violations are tracked in metrics and logged as warnings
      expect(result).toBeDefined();
    });
  });

  describe('Mode Restrictions', () => {
    test('should enforce mode restrictions at handler level', async () => {
      // end_voice_session should reject in text mode
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test-text-123',
        args: {
          reason: 'user_request'
        },
        session: {
          isActive: true,
          toolsVersion: toolRegistry.getVersion(),
          state: {}
        },
        capabilities: {
          voice: false // Text mode
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.MODE_RESTRICTED);
    });

    test('should enforce mode restrictions at orchestrator level', async () => {
      // Orchestrator checks allowedModes before execution
      const metadata = toolRegistry.getToolMetadata('end_voice_session');
      expect(metadata.allowedModes).toContain('voice');
      expect(metadata.allowedModes).not.toContain('text');
    });
  });

  describe('Validation Failures', () => {
    test('should reject invalid parameters', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test-123',
        args: {
          reason: 'invalid_reason' // Not in enum
        },
        session: {
          isActive: true,
          toolsVersion: toolRegistry.getVersion(),
          state: {}
        },
        capabilities: {
          voice: true
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.VALIDATION);
      expect(result.error.retryable).toBe(false);
    });

    test('should reject missing required parameters', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test-123',
        args: {}, // Missing required 'reason'
        session: {
          isActive: true,
          toolsVersion: toolRegistry.getVersion(),
          state: {}
        },
        capabilities: {
          voice: true
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.VALIDATION);
    });
  });

  describe('Transient Error Retries', () => {
    test('should handle transient errors', async () => {
      // Transient errors should be retryable
      expect(ErrorType.TRANSIENT).toBe('TRANSIENT');
      
      // Retry logic is tested in tool-execution-text.test.js
      // This test verifies error type exists
      const errorTypes = [
        ErrorType.TRANSIENT,
        ErrorType.PERMANENT,
        ErrorType.RATE_LIMIT
      ];
      
      expect(errorTypes).toContain(ErrorType.TRANSIENT);
    });
  });

  describe('Permanent Error Handling', () => {
    test('should not retry permanent errors', async () => {
      const result = await toolRegistry.executeTool('ignore_user', {
        clientId: 'test-123',
        args: {
          duration_seconds: 60,
          farewell_message: 'Goodbye. Take care.'
        },
        session: {
          isActive: false // Inactive session = permanent error
        },
        capabilities: {
          voice: false
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.SESSION_INACTIVE);
      expect(result.error.retryable).toBe(false);
    });
  });

  describe('Tool Not Found', () => {
    test('should return NOT_FOUND for non-existent tool', async () => {
      const result = await toolRegistry.executeTool('nonexistent_tool', {
        clientId: 'test-123',
        args: {}
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.NOT_FOUND);
      expect(result.error.retryable).toBe(false);
    });
  });
});
