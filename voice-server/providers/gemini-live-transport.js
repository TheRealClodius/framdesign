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
    // Tool calls come at root level: message.toolCall.functionCalls
    if (
      modelEvent.toolCall?.functionCalls &&
      Array.isArray(modelEvent.toolCall.functionCalls)
    ) {
      for (const call of modelEvent.toolCall.functionCalls) {
        toolCalls.push({
          id: call.id || call.name, // Gemini Live might not provide id, use name as fallback
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

    // Build function response - Gemini Live API format
    // NOTE: id field is optional and may not be present in the original call
    const functionResponse = {
      name,
      response: responseData // Just the data or error, not the full envelope
    };

    // Only include id if it was provided and is not just the name (our fallback)
    if (id && id !== name) {
      functionResponse.id = id;
    }

    console.log('[GeminiLiveTransport] Sending tool response:', JSON.stringify({
      name,
      hasId: !!functionResponse.id,
      responsePreview: JSON.stringify(responseData).substring(0, 200)
    }));

    try {
      // Use sendToolResponse method (not send) - Gemini Live API's dedicated method for tool responses
      await this.geminiSession.sendToolResponse({
        functionResponses: [functionResponse]
      });
      console.log('[GeminiLiveTransport] Tool response sent successfully');
    } catch (error) {
      console.error('[GeminiLiveTransport] Error sending tool response:', error);
      console.error('[GeminiLiveTransport] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw error;
    }
  }
}
