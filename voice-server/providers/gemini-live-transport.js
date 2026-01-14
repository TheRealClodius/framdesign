/**
 * Gemini Live Transport
 *
 * Handles tool call/response for Gemini Live API via WebSocket.
 *
 * Tool call format (from Gemini):
 * {
 *   serverContent: {
 *     toolCall: {
 *       functionCalls: [
 *         {
 *           name: 'tool_name',
 *           id: 'call_id',
 *           args: { ... }
 *         }
 *       ]
 *     }
 *   }
 * }
 *
 * Tool response format (to Gemini):
 * {
 *   clientContent: {
 *     toolResponse: {
 *       functionResponses: [
 *         {
 *           name: 'tool_name',
 *           id: 'call_id',
 *           response: { ... } // Just the data (if ok) or error (if failed)
 *         }
 *       ]
 *     }
 *   }
 * }
 * 
 * NOTE: Gemini Live API expects only the data/error, not the full ToolResponse envelope.
 * The full envelope ({ ok, data/error, intents, meta }) is for internal use only.
 */

import { ToolTransport } from './transport-interface.js';

export class GeminiLiveTransport extends ToolTransport {
  /**
   * @param {object} geminiSession - Gemini Live session object
   */
  constructor(geminiSession) {
    super();
    this.geminiSession = geminiSession;
  }

  /**
   * Parse tool calls from Gemini Live event
   *
   * @param {object} modelEvent - Gemini serverContent event
   * @returns {Array<{id: string, name: string, args: object}>} - Normalized tool calls
   */
  receiveToolCalls(modelEvent) {
    const toolCalls = [];

    // Check if event has tool calls
    if (
      modelEvent.serverContent?.toolCall?.functionCalls &&
      Array.isArray(modelEvent.serverContent.toolCall.functionCalls)
    ) {
      for (const call of modelEvent.serverContent.toolCall.functionCalls) {
        toolCalls.push({
          id: call.id,
          name: call.name,
          args: call.args || {}
        });
      }
    }

    return toolCalls;
  }

  /**
   * Send tool result back to Gemini Live
   *
   * @param {object} params - { id, name, result }
   * @returns {Promise<void>}
   */
  async sendToolResult({ id, name, result }) {
    // CRITICAL: Gemini Live API expects only the data/error, not the full envelope
    // Send result.data for success, or result.error for failure
    // The full envelope ({ ok, data/error, intents, meta }) is for internal use only
    const responseData = result.ok ? result.data : result.error;
    
    const message = {
      clientContent: {
        toolResponse: {
          functionResponses: [
            {
              id,
              name,
              response: responseData // Just the data or error, not the full envelope
            }
          ]
        }
      }
    };

    // Send via Gemini Live session
    await this.geminiSession.send(message);
  }
}
