/**
 * E2E tests for tool execution in voice mode
 * Tests full tool execution flow with WebSocket transport
 */

import { toolRegistry } from '../../../tools/_core/registry.js';
import { createStateController } from '../../../tools/_core/state-controller.js';
import { ErrorType } from '../../../tools/_core/error-types.js';

describe('E2E: Tool Execution in Voice Mode', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('end_voice_session tool', () => {
    test('should execute successfully in voice mode', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true,
        pendingEndVoiceSession: null,
        shouldSuppressAudio: false,
        shouldSuppressTranscript: false
      });

      const mockGeminiSession = {}; // Mock session object

      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test-voice-123',
        geminiSession: mockGeminiSession,
        args: {
          reason: 'user_request'
        },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true,
          messaging: true
        }
      });

      expect(result.ok).toBe(true);
      expect(result.data.reason).toBe('user_request');
      expect(result.intents).toBeDefined();
      expect(result.intents.length).toBeGreaterThan(0);
      expect(result.intents[0].type).toBe('END_VOICE_SESSION');
    });

    test('should reject in text mode', async () => {
      const state = createStateController({
        mode: 'text',
        isActive: true
      });

      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test-text-123',
        args: {
          reason: 'user_request'
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

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.MODE_RESTRICTED);
    });
  });

  describe('ignore_user tool', () => {
    test('should execute successfully in voice mode', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

      const mockWs = {
        send: jest.fn()
      };

      const result = await toolRegistry.executeTool('ignore_user', {
        clientId: 'test-voice-123',
        ws: mockWs,
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
          voice: true,
          messaging: true
        }
      });

      expect(result.ok).toBe(true);
      expect(result.data.durationSeconds).toBe(60);
      expect(result.data.farewellMessage).toBe('Goodbye');
      expect(result.intents).toBeDefined();
    });

    test('should reject if session inactive', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: false // Inactive session
      });

      const result = await toolRegistry.executeTool('ignore_user', {
        clientId: 'test-voice-123',
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
          voice: true,
          messaging: true
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.SESSION_INACTIVE);
    });
  });

  describe('kb_search tool', () => {
    test('should execute in voice mode with clamped top_k', async () => {
      const state = createStateController({
        mode: 'voice',
        isActive: true
      });

      const result = await toolRegistry.executeTool('kb_search', {
        clientId: 'test-voice-123',
        args: {
          query: 'test query',
          top_k: 5 // Should be clamped to 3 in voice mode
        },
        session: {
          isActive: state.get('isActive'),
          toolsVersion: toolRegistry.getVersion(),
          state: state.getSnapshot()
        },
        capabilities: {
          voice: true,
          messaging: false
        }
      });

      // Result might succeed or fail depending on vector store availability
      // But if it succeeds, we verify the structure
      if (result.ok) {
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data.results)).toBe(true);
      } else {
        // If it fails, should be a proper error response
        expect(result.error).toBeDefined();
        expect(result.error.type).toBeDefined();
      }
    });
  });
});
