/**
 * E2E tests for meta-tool discovery workflow
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { toolRegistry } from '../../tools/_core/registry.js';

describe('E2E: Meta-Tool Discovery Flow', () => {
  beforeAll(async () => {
    if (!toolRegistry.tools.size) {
      await toolRegistry.load();
      toolRegistry.lock();
    }
  });

  test('complete discovery workflow: list -> describe -> execute', async () => {
    const listResult = await toolRegistry.executeTool('list_tools', {
      clientId: 'test-discovery',
      args: { category: 'action' }
    });

    expect(listResult.ok).toBe(true);
    expect(listResult.data.tools.length).toBeGreaterThan(0);

    const startVoiceTool = listResult.data.tools.find(tool => tool.name === 'start_voice_session');
    expect(startVoiceTool).toBeDefined();

    const describeResult = await toolRegistry.executeTool('describe_tool', {
      clientId: 'test-discovery',
      args: { name: 'start_voice_session' }
    });

    expect(describeResult.ok).toBe(true);
    expect(describeResult.data.parameters.type).toBe('object');

    const executeResult = await toolRegistry.executeTool('run_tool', {
      clientId: 'test-discovery',
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

    expect(executeResult.ok).toBe(true);
    expect(executeResult.data.voice_session_requested).toBe(true);
  });
});
