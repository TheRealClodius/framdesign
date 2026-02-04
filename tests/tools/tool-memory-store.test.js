import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { toolMemoryStore } from '../../tools/_core/tool-memory-store.js';

const BASE_RECORD = {
  id: 'call-1',
  toolId: 'kb_search',
  args: { query: 'fram' },
  argsHash: JSON.stringify({ query: 'fram' }),
  ok: true,
  fullResponse: { ok: true, data: { results: [] } },
  summary: null,
  error: null,
  tokens: 10,
  duration: 5,
  turn: 1
};

describe('ToolMemoryStore cleanup', () => {
  let nowSpy;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now');
    toolMemoryStore.clearAll();
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  test('cleans up expired sessions after inactivity', () => {
    nowSpy.mockReturnValue(0);
    toolMemoryStore.recordToolCall('session-a', { ...BASE_RECORD, timestamp: 0 });
    expect(toolMemoryStore.getSessionCount()).toBe(1);

    nowSpy.mockReturnValue(60 * 60 * 1000 + 1); // past TTL
    toolMemoryStore.queryToolCalls('session-a', { timeRange: 'all' });

    expect(toolMemoryStore.getSessionCount()).toBe(0);
  });

  test('removes session when all calls expire', () => {
    nowSpy.mockReturnValue(2 * 60 * 60 * 1000); // far in future
    toolMemoryStore.recordToolCall('session-b', { ...BASE_RECORD, id: 'call-old', timestamp: 1 });

    expect(toolMemoryStore.getSessionCount()).toBe(0);
  });
});
