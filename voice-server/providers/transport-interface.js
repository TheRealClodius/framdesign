/**
 * Transport Interface
 *
 * Abstract tool call/response protocol from provider-specific formats.
 *
 * Purpose:
 * - Parse incoming tool calls from different provider formats
 * - Send tool responses back in provider-specific formats
 * - Preserve full ToolResponse envelope (don't strip to just data)
 *
 * Implementations:
 * - GeminiLiveTransport: WebSocket tool events (functionCalls format)
 * - OpenAITransport: Realtime API tool calls (tool_calls format)
 */

/**
 * Base ToolTransport class
 *
 * Implementations should extend this and implement the abstract methods.
 */
export class ToolTransport {
  /**
   * Parse tool calls from model message/event
   *
   * @param {object} modelEvent - Provider-specific event/message
   * @returns {Array<{id: string, name: string, args: object}>} - Normalized tool calls
   *
   * Example return:
   * [
   *   { id: 'call_123', name: 'kb_search', args: { query: 'test' } }
   * ]
   */
  receiveToolCalls(modelEvent) {
    throw new Error('receiveToolCalls() must be implemented by subclass');
  }

  /**
   * Send tool result back to model
   *
   * CRITICAL: Must send full ToolResponse envelope, not just result.data
   *
   * @param {object} params - { id, name, result }
   * @param {string} params.id - Tool call ID
   * @param {string} params.name - Tool name
   * @param {object} params.result - Full ToolResponse envelope { ok, data/error, intents, meta }
   * @returns {Promise<void>}
   */
  async sendToolResult({ id, name, result }) {
    throw new Error('sendToolResult() must be implemented by subclass');
  }
}
