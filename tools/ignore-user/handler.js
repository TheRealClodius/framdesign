/**
 * ignore_user Tool Handler
 *
 * Blocks disrespectful users for specified duration and ends voice session.
 */

import { ErrorType, ToolError, IntentType } from '../_core/error-types.js';

/**
 * Execute ignore_user tool
 *
 * @param {object} context - Execution context
 * @returns {Promise<ToolResponse>} - Result envelope
 */
export async function execute(context) {
  const { args, clientId, ws, geminiSession, session, capabilities } = context;

  // Check session is active
  if (!session.isActive) {
    throw new ToolError(ErrorType.SESSION_INACTIVE, 'Cannot ignore user: session is not active', {
      retryable: false
    });
  }

  const durationSeconds = args.duration_seconds;
  const farewellMessage = args.farewell_message;
  const timeoutUntil = Date.now() + (durationSeconds * 1000);

  // Send timeout command to client (voice mode)
  if (ws && capabilities.messaging) {
    try {
      ws.send(JSON.stringify({
        type: 'timeout',
        timeoutUntil,
        durationSeconds,
        message: farewellMessage
      }));
    } catch (error) {
      console.error(`[ignore_user] Failed to send timeout command to client ${clientId}:`, error);
      // Continue anyway - timeout still enforced server-side
    }
  }

  // Track farewell delivery
  let farewellDelivered = false;

  // Deliver farewell via voice (if in voice mode)
  if (geminiSession && capabilities.voice) {
    // Voice farewell will be delivered by orchestrator
    // We just return the message in data
    farewellDelivered = true;
  } else if (ws && capabilities.messaging) {
    // Text mode - send farewell as message
    try {
      ws.send(JSON.stringify({
        type: 'message',
        content: farewellMessage,
        role: 'assistant'
      }));
      farewellDelivered = true;
    } catch (error) {
      console.error(`[ignore_user] Failed to send farewell message to client ${clientId}:`, error);
    }
  }

  // Log timeout
  console.log(`[ignore_user] Client ${clientId} blocked for ${durationSeconds}s until ${new Date(timeoutUntil).toISOString()}`);

  // Return success with intents
  return {
    ok: true,
    data: {
      timeoutUntil,
      durationSeconds,
      farewellDelivered,
      farewellMessage // Include for orchestrator to potentially speak
    },
    intents: [
      // End voice session after delivering farewell
      {
        type: IntentType.END_VOICE_SESSION,
        after: 'current_turn'
      },
      // Suppress transcript of timeout message (optional)
      {
        type: IntentType.SUPPRESS_TRANSCRIPT,
        value: true
      }
    ]
  };
}
