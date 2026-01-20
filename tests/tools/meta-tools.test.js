/**
 * Unit tests for meta-tool system
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';
import { ErrorType } from '../../tools/_core/error-types.js';

describe('Meta-Tool System', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  describe('list_tools', () => {
    test('should list all concrete tools (exclude meta-tools)', async () => {
      const result = await toolRegistry.executeTool('list_tools', {
        clientId: 'test-123',
        args: {}
      });

      expect(result.ok).toBe(true);
      expect(result.data.tools).toBeDefined();
      expect(result.data.tools.length).toBeGreaterThan(0);

      const toolNames = result.data.tools.map(tool => tool.name);
      expect(toolNames).not.toContain('list_tools');
      expect(toolNames).not.toContain('describe_tool');
      expect(toolNames).not.toContain('run_tool');
    });

    test('should filter by category', async () => {
      const result = await toolRegistry.executeTool('list_tools', {
        clientId: 'test-123',
        args: { category: 'retrieval' }
      });

      expect(result.ok).toBe(true);
      const categories = result.data.tools.map(tool => tool.category);
      expect(categories.every(category => category === 'retrieval')).toBe(true);
    });

    test('should filter by mode', async () => {
      const result = await toolRegistry.executeTool('list_tools', {
        clientId: 'test-123',
        args: { mode: 'voice' }
      });

      expect(result.ok).toBe(true);
      result.data.tools.forEach(tool => {
        expect(tool.modes).toContain('voice');
      });
    });
  });

  describe('describe_tool', () => {
    test('should return full documentation for kb_search', async () => {
      const result = await toolRegistry.executeTool('describe_tool', {
        clientId: 'test-123',
        args: { name: 'kb_search' }
      });

      expect(result.ok).toBe(true);
      expect(result.data.name).toBe('kb_search');
      expect(result.data.parameters).toBeDefined();
      expect(result.data.documentation).toBeDefined();
      expect(result.data.category).toBe('retrieval');
    });

    test('should error on non-existent tool', async () => {
      const result = await toolRegistry.executeTool('describe_tool', {
        clientId: 'test-123',
        args: { name: 'fake_tool' }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.NOT_FOUND);
    });

    test('should prevent describing meta-tools', async () => {
      const result = await toolRegistry.executeTool('describe_tool', {
        clientId: 'test-123',
        args: { name: 'run_tool' }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.INVALID_REQUEST);
    });
  });

  describe('run_tool', () => {
    test('should execute start_voice_session via run_tool', async () => {
      const result = await toolRegistry.executeTool('run_tool', {
        clientId: 'test-123',
        args: {
          name: 'start_voice_session',
          args: {
            pending_request: 'explain design'
          }
        },
        session: {
          state: { mode: 'text' }
        },
        capabilities: {
          voice: false
        }
      });

      expect(result.ok).toBe(true);
      expect(result.data.voice_session_requested).toBe(true);
    });

    test('should prevent meta-tool recursion', async () => {
      const result = await toolRegistry.executeTool('run_tool', {
        clientId: 'test-123',
        args: {
          name: 'list_tools',
          args: {}
        },
        session: {
          state: { mode: 'text' }
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.INVALID_REQUEST);
      expect(result.error.message).toContain('Meta-tools cannot be executed via run_tool');
    });

    test('should enforce mode restrictions', async () => {
      const result = await toolRegistry.executeTool('run_tool', {
        clientId: 'test-123',
        args: {
          name: 'end_voice_session',
          args: { reason: 'user_request' }
        },
        session: {
          state: { mode: 'text' }
        },
        capabilities: {
          voice: false
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.MODE_RESTRICTED);
    });

    test('should validate arguments against tool schema', async () => {
      const result = await toolRegistry.executeTool('run_tool', {
        clientId: 'test-123',
        args: {
          name: 'kb_search',
          args: {
            top_k: 5
          }
        },
        session: {
          state: { mode: 'text' }
        }
      });

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe(ErrorType.VALIDATION);
    });
  });
});
