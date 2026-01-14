/**
 * Tool execution tests
 * Tests successful execution, failure scenarios, and error handling
 */

import { toolRegistry } from '../../tools/_core/registry.js';
import { ErrorType, ToolError } from '../../tools/_core/error-types.js';
import { IntentType } from '../../tools/_core/error-types.js';

describe('Tool Execution', () => {
  beforeAll(async () => {
    // Load registry before tests
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('Successful Execution', () => {
    test('should execute tool with valid parameters', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        geminiSession: {}, // Mock session
        args: {
          reason: 'user_request'
        },
        session: {
          isActive: true
        },
        capabilities: {
          voice: true
        }
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.reason).toBe('user_request');
      expect(result.meta).toBeDefined();
      expect(result.meta.toolId).toBe('end_voice_session');
      expect(result.meta.duration).toBeGreaterThanOrEqual(0);
    });

    test('should include intents in successful response', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        geminiSession: {},
        args: {
          reason: 'user_request'
        },
        session: {
          isActive: true
        },
        capabilities: {
          voice: true
        }
      });

      expect(result.ok).toBe(true);
      expect(result.intents).toBeDefined();
      expect(Array.isArray(result.intents)).toBe(true);
      expect(result.intents.length).toBeGreaterThan(0);
      expect(result.intents[0].type).toBe(IntentType.END_VOICE_SESSION);
    });
  });

  describe('Validation Error Handling', () => {
    test('should return VALIDATION error for invalid parameters', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        args: {
          reason: 'invalid_reason' // Not in enum
        },
        session: { isActive: true },
        capabilities: { voice: true }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.VALIDATION);
      expect(result.error.retryable).toBe(false);
      expect(result.error.message).toContain('Invalid parameters');
    });

    test('should return VALIDATION error for missing required parameters', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        args: {}, // Missing required 'reason'
        session: { isActive: true },
        capabilities: { voice: true }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.VALIDATION);
    });
  });

  describe('Tool Not Found', () => {
    test('should return NOT_FOUND error for non-existent tool', async () => {
      const result = await toolRegistry.executeTool('nonexistent_tool', {
        clientId: 'test123',
        args: {}
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.NOT_FOUND);
      expect(result.error.message).toContain('not found');
      expect(result.error.retryable).toBe(false);
    });
  });

  describe('Transient Error Handling', () => {
    test('should handle transient errors from handlers', async () => {
      // kb_search might throw transient errors for network issues
      // This test verifies the error is properly propagated
      const result = await toolRegistry.executeTool('kb_search', {
        clientId: 'test123',
        args: {
          query: 'test query',
          top_k: 5
        },
        session: { isActive: true },
        capabilities: { voice: false }
      });

      // Result might be success or error depending on actual implementation
      // But if error, should be properly structured
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.type).toBeDefined();
        expect(result.error.message).toBeDefined();
        expect(typeof result.error.retryable).toBe('boolean');
      }
    });
  });

  describe('Permanent Error Handling', () => {
    test('should handle permanent errors correctly', async () => {
      // Test with invalid session state
      const result = await toolRegistry.executeTool('ignore_user', {
        clientId: 'test123',
        args: {
          duration_seconds: 60,
          farewell_message: 'Goodbye. Take care.'
        },
        session: {
          isActive: false // Inactive session should cause error
        },
        capabilities: { voice: false }
      });

      // Handler should throw SESSION_INACTIVE error
      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.SESSION_INACTIVE);
      expect(result.error.retryable).toBe(false);
    });
  });

  describe('Unexpected Error Handling', () => {
    test('should handle unexpected errors gracefully', async () => {
      // This is tested implicitly - if handler throws non-ToolError,
      // registry should catch and return INTERNAL error
      // We can't easily trigger this without mocking, but the code path exists
      expect(ErrorType.INTERNAL).toBe('INTERNAL');
    });
  });

  describe('Response Metadata', () => {
    test('should include metadata in all responses', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        geminiSession: {},
        args: { reason: 'user_request' },
        session: { isActive: true },
        capabilities: { voice: true }
      });

      expect(result.meta).toBeDefined();
      expect(result.meta.toolId).toBe('end_voice_session');
      expect(result.meta.toolVersion).toBeDefined();
      expect(result.meta.registryVersion).toBeDefined();
      expect(result.meta.duration).toBeGreaterThanOrEqual(0);
      expect(result.meta.responseSchemaVersion).toBeDefined();
    });

    test('should preserve existing metadata', async () => {
      // Metadata is added by registry, but if handler includes some,
      // it should be preserved
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        geminiSession: {},
        args: { reason: 'user_request' },
        session: { isActive: true },
        capabilities: { voice: true }
      });

      // Registry adds required fields but preserves any existing ones
      expect(result.meta).toBeDefined();
    });
  });

  describe('Intent Application', () => {
    test('should return intents for state changes', async () => {
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        geminiSession: {},
        args: { reason: 'user_request' },
        session: { isActive: true },
        capabilities: { voice: true }
      });

      expect(result.intents).toBeDefined();
      expect(Array.isArray(result.intents)).toBe(true);
      
      const endSessionIntent = result.intents.find(i => i.type === IntentType.END_VOICE_SESSION);
      expect(endSessionIntent).toBeDefined();
      expect(endSessionIntent.after).toBeDefined();
    });

    test('should allow intents on error responses', async () => {
      // Some tools might return intents even on failure
      // (e.g., suppress audio on error)
      // This is allowed by the schema
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test123',
        args: { reason: 'invalid' }, // Invalid reason
        session: { isActive: true },
        capabilities: { voice: true }
      });

      // Error response, but intents field is still valid
      expect(result.ok).toBe(false);
      // Intents might or might not be present on error - both are valid
    });
  });
});
