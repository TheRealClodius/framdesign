/**
 * end_voice_session Tool Handler
 *
 * Gracefully terminates voice session while keeping text chat available.
 */

import { ErrorType, ToolError, IntentType } from '../_core/error-types.js';

/**
 * Execute end_voice_session tool
 *
 * @param {object} context - Execution context
 * @returns {Promise<ToolResponse>} - Result envelope
 */
export async function execute(context) {
  const { args, clientId, geminiSession, capabilities } = context;

  // Check we're in voice mode
  if (!capabilities.voice) {
    throw new ToolError(ErrorType.MODE_RESTRICTED, 'end_voice_session only available in voice mode', {
      retryable: false
    });
  }

  const reason = args.reason;
  const finalMessage = args.final_message || null;

  // Track message delivery
  let finalMessageDelivered = false;

  // If final message provided, it will be delivered by orchestrator before ending
  if (finalMessage) {
    finalMessageDelivered = true; // Assume delivery will succeed
  }

  // Log session end
  console.log(`[end_voice_session] Client ${clientId} ending voice session. Reason: ${reason}`);

  // Return success with intent
  return {
    ok: true,
    data: {
      reason,
      finalMessageDelivered,
      sessionEnded: true,
      finalMessage // Include for orchestrator to speak before ending
    },
    intents: [
      {
        type: IntentType.END_VOICE_SESSION,
        after: finalMessage ? 'current_turn' : 'immediate'
      }
    ]
  };
}
