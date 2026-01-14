/**
 * ToolResponse Schema - Formal Contract (v1.0.0)
 *
 * This is the central contract between:
 * - Tool handlers (return this)
 * - Registry (validates and normalizes this)
 * - Orchestrator (interprets and applies this)
 * - Transport layer (serializes this to provider)
 *
 * CRITICAL INVARIANTS:
 * 1. Every tool execution returns exactly one ToolResponse
 * 2. ok=true XOR ok=false (never both, never neither)
 * 3. If ok=true, data field SHOULD be present (may be null/undefined for side-effect-only tools)
 * 4. If ok=false, error field MUST be present with type + message + retryable
 * 5. meta field MUST always be present (added by registry if missing)
 * 6. intents field MAY be present in both success and failure cases
 *
 */

/**
 * ToolResponse type definition (for reference)
 *
 * Success:
 * {
 *   ok: true,
 *   data?: any,              // Tool-specific result data
 *   intents?: Intent[],      // State changes to apply
 *   meta: ToolResponseMeta   // Execution metadata (added by registry)
 * }
 *
 * Failure:
 * {
 *   ok: false,
 *   error: ToolError,        // Structured error with type + message + flags
 *   intents?: Intent[],      // Allowed even on failure (e.g., suppress audio)
 *   meta: ToolResponseMeta   // Execution metadata (added by registry)
 * }
 */

/**
 * Validate ToolResponse structure
 *
 * Called by registry to ensure handlers return valid responses.
 * Throws Error if validation fails.
 *
 * @param {object} response - Response from tool handler
 * @returns {boolean} - true if valid
 * @throws {Error} - If structure invalid
 */
export function validateToolResponse(response) {
  // Validate response is object
  if (!response || typeof response !== 'object') {
    throw new Error('ToolResponse must be an object');
  }

  // Validate ok field
  if (typeof response.ok !== 'boolean') {
    throw new Error('ToolResponse.ok must be boolean');
  }

  // Validate failure case
  if (response.ok === false) {
    if (!response.error || typeof response.error !== 'object') {
      throw new Error('ToolResponse with ok=false must have error object');
    }
    if (!response.error.type || typeof response.error.type !== 'string') {
      throw new Error('ToolResponse.error must have type string');
    }
    if (!response.error.message || typeof response.error.message !== 'string') {
      throw new Error('ToolResponse.error must have message string');
    }
    if (typeof response.error.retryable !== 'boolean') {
      throw new Error('ToolResponse.error must have retryable boolean');
    }
  }

  // Validate intents array if present
  if (response.intents !== undefined) {
    if (!Array.isArray(response.intents)) {
      throw new Error('ToolResponse.intents must be an array if present');
    }
    for (const intent of response.intents) {
      if (!intent || typeof intent !== 'object') {
        throw new Error('Each intent must be an object');
      }
      if (!intent.type || typeof intent.type !== 'string') {
        throw new Error('Each intent must have type string');
      }
    }
  }

  // Validate meta object if present
  if (response.meta !== undefined && typeof response.meta !== 'object') {
    throw new Error('ToolResponse.meta must be an object if present');
  }

  return true;
}

/**
 * ToolResponse version
 *
 * Changes to ToolResponse schema require:
 * 1. Version bump
 * 2. Migration guide for existing tools
 * 3. Backward compatibility handling in registry
 */
export const TOOL_RESPONSE_SCHEMA_VERSION = '1.0.0';

/**
 * Error Generation Rules by Layer
 *
 * Pre-execution errors (Registry + Orchestrator):
 * - partialSideEffects=false (no execution happened)
 * - retryable=false (policy or validation errors)
 *
 * Domain errors (Tool Handlers):
 * - retryable decided by domain logic
 * - partialSideEffects tracked by handler
 *
 * Unexpected errors (Registry):
 * - assumes partialSideEffects=true (conservative approach)
 *
 * Confirmation errors (Orchestrator ONLY):
 * - includes confirmation_request field
 *
 * Future Evolution Possibilities:
 * - Version 1.1.0: parentCallId, backgroundTask
 * - Version 2.0.0: streaming support, cancellation tokens
 */
