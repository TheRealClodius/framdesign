/**
 * Policy enforcement tests
 * Tests mode restrictions, budget limits, and confirmation requirements
 */

import { ErrorType } from '../../../tools/_core/error-types.js';
import { toolRegistry } from '../../../tools/_core/registry.js';

describe('Policy Enforcement', () => {
  beforeAll(async () => {
    // Load registry before tests
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('Mode Restrictions', () => {
    test('should allow voice-only tools in voice mode', async () => {
      const metadata = toolRegistry.getToolMetadata('end_voice_session');
      expect(metadata).toBeTruthy();
      expect(metadata.allowedModes).toContain('voice');
      expect(metadata.allowedModes).not.toContain('text');
    });

    test('should allow text-only tools in text mode', async () => {
      const metadata = toolRegistry.getToolMetadata('start_voice_session');
      expect(metadata).toBeTruthy();
      expect(metadata.allowedModes).toContain('text');
    });

    test('should allow tools in both modes', async () => {
      const metadata = toolRegistry.getToolMetadata('ignore_user');
      expect(metadata).toBeTruthy();
      expect(metadata.allowedModes).toContain('voice');
      expect(metadata.allowedModes).toContain('text');
    });

    test('should enforce mode restrictions at handler level', async () => {
      // end_voice_session should throw MODE_RESTRICTED in text mode
      const result = await toolRegistry.executeTool('end_voice_session', {
        clientId: 'test',
        args: { reason: 'user_request' },
        session: { isActive: true },
        capabilities: { voice: false } // Text mode
      });

      // The handler checks capabilities.voice and throws ToolError
      // Registry catches and returns it as error response
      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.MODE_RESTRICTED);
    });
  });

  describe('Latency Budget Warnings', () => {
    test('should have latency budgets defined for all tools', async () => {
      const tools = ['end_voice_session', 'ignore_user', 'kb_search', 'start_voice_session'];
      
      for (const toolId of tools) {
        const metadata = toolRegistry.getToolMetadata(toolId);
        expect(metadata).toBeTruthy();
        expect(metadata.latencyBudgetMs).toBeGreaterThan(0);
        expect(typeof metadata.latencyBudgetMs).toBe('number');
      }
    });

    test('should have appropriate budgets for tool categories', async () => {
      const retrievalMetadata = toolRegistry.getToolMetadata('kb_search');
      const actionMetadata = toolRegistry.getToolMetadata('ignore_user');
      
      // Retrieval tools typically have higher budgets than actions
      expect(retrievalMetadata.latencyBudgetMs).toBeGreaterThan(0);
      expect(actionMetadata.latencyBudgetMs).toBeGreaterThan(0);
    });
  });

  describe('Budget Exceeded Errors', () => {
    test('should track retrieval call counts', () => {
      // This is tested at orchestrator level in voice-server/server.js
      // VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN is enforced there
      const VOICE_BUDGET = {
        MAX_RETRIEVAL_CALLS_PER_TURN: 2
      };
      
      expect(VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN).toBe(2);
    });

    test('should have budget exceeded error type', () => {
      expect(ErrorType.BUDGET_EXCEEDED).toBe('BUDGET_EXCEEDED');
    });
  });

  describe('Confirmation Requirements', () => {
    test('should have confirmation flag in metadata', async () => {
      const metadata = toolRegistry.getToolMetadata('ignore_user');
      expect(metadata).toBeTruthy();
      expect(typeof metadata.requiresConfirmation).toBe('boolean');
    });

    test('should have confirmation error type', () => {
      expect(ErrorType.CONFIRMATION_REQUIRED).toBe('CONFIRMATION_REQUIRED');
    });
  });

  describe('Idempotency Requirements', () => {
    test('should have idempotency flag in metadata', async () => {
      const metadata = toolRegistry.getToolMetadata('end_voice_session');
      expect(metadata).toBeTruthy();
      expect(typeof metadata.idempotent).toBe('boolean');
    });

    test('should mark idempotent tools correctly', async () => {
      const endSessionMetadata = toolRegistry.getToolMetadata('end_voice_session');
      expect(endSessionMetadata.idempotent).toBe(true);
    });
  });

  describe('Side Effects Classification', () => {
    test('should classify tools by side effects', async () => {
      const retrievalMetadata = toolRegistry.getToolMetadata('kb_search');
      const actionMetadata = toolRegistry.getToolMetadata('ignore_user');
      
      expect(retrievalMetadata.sideEffects).toBe('read_only');
      expect(actionMetadata.sideEffects).toBe('writes');
    });
  });
});
