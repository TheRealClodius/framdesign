/**
 * start_voice_session Tool Handler
 *
 * Minimal handler since actual voice session initiation happens at API level
 * (app/api/chat/route.ts lines 799-826 already implemented).
 *
 * This handler validates context and returns success with metadata.
 * The API layer intercepts this tool call and returns special JSON response.
 */

import { ErrorType, ToolError } from '../_core/error-types.js';

/**
 * Execute start_voice_session tool
 *
 * @param {object} context - Execution context
 * @returns {Promise<ToolResponse>} - Result envelope
 */
export async function execute(context) {
  const { args, capabilities, clientId } = context;

  // Verify we're in text mode (should be enforced by orchestrator)
  if (capabilities?.voice) {
    throw new ToolError(
      ErrorType.MODE_RESTRICTED,
      'start_voice_session only available in text mode',
      { retryable: false }
    );
  }

  const pendingRequest = args.pending_request || null;

  console.log(
    `[start_voice_session] Client ${clientId} requesting voice mode`,
    pendingRequest ? `with pending request: "${pendingRequest}"` : '(no pending request)'
  );

  // Return success - actual voice activation handled by API layer
  return {
    ok: true,
    data: {
      voice_session_requested: true,
      pending_request: pendingRequest,
      message: 'Voice session will be activated by client'
    }
  };
}
