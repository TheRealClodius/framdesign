import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { GeminiLiveTransport } from '../../voice-server/providers/gemini-live-transport.js';

const baseCall = {
  name: 'kb_search',
  id: 'call-1',
  args: { query: 'fram' }
};

describe('GeminiLiveTransport', () => {
  let sendToolResponse;
  let transport;

  beforeEach(() => {
    sendToolResponse = jest.fn().mockResolvedValue(undefined);
    transport = new GeminiLiveTransport({ sendToolResponse });
  });

  describe('receiveToolCalls', () => {
    test('handles direct functionCalls array', () => {
      const result = transport.receiveToolCalls({ functionCalls: [baseCall] });
      expect(result).toEqual([{ id: 'call-1', name: 'kb_search', args: { query: 'fram' } }]);
    });

    test('handles toolCall.functionCalls', () => {
      const result = transport.receiveToolCalls({ toolCall: { functionCalls: [baseCall] } });
      expect(result).toEqual([{ id: 'call-1', name: 'kb_search', args: { query: 'fram' } }]);
    });

    test('handles toolCalls array (plural)', () => {
      const result = transport.receiveToolCalls({ toolCalls: [baseCall] });
      expect(result).toEqual([{ id: 'call-1', name: 'kb_search', args: { query: 'fram' } }]);
    });

    test('handles serverContent.toolCall.functionCalls', () => {
      const result = transport.receiveToolCalls({
        serverContent: { toolCall: { functionCalls: [baseCall] } }
      });
      expect(result).toEqual([{ id: 'call-1', name: 'kb_search', args: { query: 'fram' } }]);
    });

    test('handles bidiGenerateContentToolCall.toolCall.functionCalls', () => {
      const result = transport.receiveToolCalls({
        bidiGenerateContentToolCall: { toolCall: { functionCalls: [baseCall] } }
      });
      expect(result).toEqual([{ id: 'call-1', name: 'kb_search', args: { query: 'fram' } }]);
    });

    test('handles bidiGenerateContentToolCall.functionCalls', () => {
      const result = transport.receiveToolCalls({
        bidiGenerateContentToolCall: { functionCalls: [baseCall] }
      });
      expect(result).toEqual([{ id: 'call-1', name: 'kb_search', args: { query: 'fram' } }]);
    });
  });

  describe('sendToolResult', () => {
    test('sends only data payload on success and includes id when provided', async () => {
      await transport.sendToolResult({
        id: 'call-1',
        name: 'kb_search',
        result: { ok: true, data: { answer: 'ok' } }
      });

      expect(sendToolResponse).toHaveBeenCalledTimes(1);
      const payload = sendToolResponse.mock.calls[0][0];
      expect(payload.functionResponses[0]).toEqual({
        name: 'kb_search',
        id: 'call-1',
        response: { answer: 'ok' }
      });
    });

    test('falls back to name as id when none provided', async () => {
      await transport.sendToolResult({
        id: null,
        name: 'kb_search',
        result: { ok: true, data: { answer: 'ok' } }
      });

      const payload = sendToolResponse.mock.calls[0][0];
      expect(payload.functionResponses[0].id).toBe('kb_search');
      expect(payload.functionResponses[0].response).toEqual({ answer: 'ok' });
    });

    test('sends only error payload on failure', async () => {
      await transport.sendToolResult({
        id: 'call-2',
        name: 'kb_search',
        result: { ok: false, error: { type: 'TRANSIENT', message: 'boom' } }
      });

      const payload = sendToolResponse.mock.calls[0][0];
      expect(payload.functionResponses[0]).toEqual({
        name: 'kb_search',
        id: 'call-2',
        response: { type: 'TRANSIENT', message: 'boom' }
      });
    });
  });
});
