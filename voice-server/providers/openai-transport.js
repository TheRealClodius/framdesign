/**
 * OpenAI Transport
 *
 * Handles tool call/response for OpenAI Realtime API.
 *
 * Tool call format (from OpenAI):
 * {
 *   type: 'response.function_call_arguments.done',
 *   call_id: 'call_...',
 *   name: 'tool_name',
 *   arguments: '{"param":"value"}'  // JSON string
 * }
 *
 * Tool response format (to OpenAI):
 * {
 *   type: 'conversation.item.create',
 *   item: {
 *     type: 'function_call_output',
 *     call_id: 'call_...',
 *     output: '{"ok":true, ...}'  // Full ToolResponse as JSON string
 *   }
 * }
 */

import { ToolTransport } from './transport-interface.js';

export class OpenAITransport extends ToolTransport {
  /**
   * @param {object} client - OpenAI Realtime client
   * @param {string} conversationId - Current conversation ID
   */
  constructor(client, conversationId) {
    super();
    this.client = client;
    this.conversationId = conversationId;
  }

  /**
   * Parse tool calls from OpenAI Realtime event
   *
   * @param {object} modelEvent - OpenAI event
   * @returns {Array<{id: string, name: string, args: object}>} - Normalized tool calls
   */
  receiveToolCalls(modelEvent) {
    const toolCalls = [];

    // Check for function call completion event
    if (
      modelEvent.type === 'response.function_call_arguments.done' &&
      modelEvent.call_id &&
      modelEvent.name &&
      modelEvent.arguments
    ) {
      try {
        const args = JSON.parse(modelEvent.arguments);
        toolCalls.push({
          id: modelEvent.call_id,
          name: modelEvent.name,
          args
        });
      } catch (error) {
        console.error(`[OpenAITransport] Failed to parse arguments for ${modelEvent.name}:`, error);
      }
    }

    return toolCalls;
  }

  /**
   * Send tool result back to OpenAI Realtime
   *
   * @param {object} params - { id, name, result }
   * @returns {Promise<void>}
   */
  async sendToolResult({ id, name, result }) {
    // CRITICAL: Send full ToolResponse envelope
    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: id,
        output: JSON.stringify(result) // Full envelope: { ok, data/error, intents, meta }
      }
    };

    // Send via OpenAI Realtime client
    await this.client.send(message);
  }
}
