/**
 * Error classification for tool execution
 *
 * Used by:
 * - Tool handlers (return domain failures, throw unexpected errors)
 * - Registry (standardize and classify errors)
 * - Orchestrator (make recovery decisions)
 */

/**
 * Error type classification
 *
 * Determines:
 * - Who generates this error (registry, orchestrator, or tool handler)
 * - Whether error is retryable
 * - Whether partial side effects occurred
 */
export const ErrorType = {
  // Registry-generated errors (pre-execution)
  VALIDATION: 'VALIDATION',           // Invalid parameters (schema violation)
  NOT_FOUND: 'NOT_FOUND',            // Tool doesn't exist
  INTERNAL: 'INTERNAL',              // Unexpected internal error

  // Orchestrator-generated errors (policy enforcement)
  MODE_RESTRICTED: 'MODE_RESTRICTED', // Tool not allowed in current mode
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED', // Retrieval/total tool budget exceeded
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED', // Action requires user confirmation

  // Tool handler errors (domain failures)
  SESSION_INACTIVE: 'SESSION_INACTIVE', // Session state error
  TRANSIENT: 'TRANSIENT',            // Temporary failure (network, timeout)
  PERMANENT: 'PERMANENT',            // Permanent failure (don't retry)
  RATE_LIMIT: 'RATE_LIMIT',          // Rate limit exceeded
  AUTH: 'AUTH',                      // Authentication error
  CONFLICT: 'CONFLICT'               // Resource conflict
};

/**
 * Custom error class for tool handlers
 *
 * Throw this when tools encounter expected failure modes.
 * Registry catches and normalizes into standard ToolResponse error shape.
 *
 * Example:
 *   throw new ToolError(ErrorType.TRANSIENT, 'WebSocket connection lost', {
 *     retryable: true,
 *     partialSideEffects: false
 *   });
 */
export class ToolError extends Error {
  constructor(type, message, options = {}) {
    super(message);
    this.name = 'ToolError';
    this.type = type;
    this.retryable = options.retryable || false;
    this.idempotencyRequired = options.idempotencyRequired || false;
    this.partialSideEffects = options.partialSideEffects || false;
    this.details = options.details || null;
    this.confirmation_request = options.confirmation_request || null;
  }
}

/**
 * Intent types for state changes
 *
 * Tools return intents in their ToolResponse.
 * Orchestrator applies intents to session state after tool execution.
 *
 * Example:
 *   return {
 *     ok: true,
 *     data: { ... },
 *     intents: [
 *       { type: IntentType.END_VOICE_SESSION, after: 'current_turn' },
 *       { type: IntentType.SUPPRESS_AUDIO, value: true }
 *     ]
 *   };
 */
export const IntentType = {
  END_VOICE_SESSION: 'END_VOICE_SESSION',     // End voice session
  SUPPRESS_AUDIO: 'SUPPRESS_AUDIO',           // Don't generate audio response
  SUPPRESS_TRANSCRIPT: 'SUPPRESS_TRANSCRIPT', // Don't show transcript
  SET_PENDING_MESSAGE: 'SET_PENDING_MESSAGE'  // Queue message for next turn
};

/**
 * Layer Responsibility Documentation
 *
 * Which layer generates which ErrorType?
 *
 * Registry (pre-execution):
 * - VALIDATION: Invalid parameters (schema violation)
 * - NOT_FOUND: Tool doesn't exist
 * - INTERNAL: Unexpected internal error
 *
 * Orchestrator (policy enforcement):
 * - MODE_RESTRICTED: Tool not allowed in current mode
 * - BUDGET_EXCEEDED: Retrieval/total tool budget exceeded
 * - CONFIRMATION_REQUIRED: Action requires user confirmation
 *
 * Tool Handler (domain failures):
 * - SESSION_INACTIVE: Session state error
 * - TRANSIENT: Temporary failure (network, timeout)
 * - PERMANENT: Permanent failure (don't retry)
 * - RATE_LIMIT: Rate limit exceeded
 * - AUTH: Authentication error
 * - CONFLICT: Resource conflict
 */
