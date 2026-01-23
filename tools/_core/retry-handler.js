/**
 * Retry Handler
 *
 * Implements exponential backoff retry logic for transient errors.
 * Respects mode constraints (no retries in voice mode due to latency budget).
 *
 * Usage:
 *   const result = await retryWithBackoff(
 *     () => toolRegistry.executeTool(toolId, context),
 *     {
 *       mode: 'text',
 *       maxRetries: 3,
 *       toolId: 'kb_search',
 *       toolMetadata: metadata
 *     }
 *   );
 */

import { ErrorType } from './error-types.js';

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 300,  // Increased from 100ms to account for Qdrant indexing delays
  maxDelayMs: 3000,      // Increased from 2000ms
  backoffMultiplier: 2,
  outageInitialDelayMs: 1000, // Slower retries during service outage (e.g., 503)
  outageMaxDelayMs: 10000,
  outageBackoffMultiplier: 2,
  jitterRatio: 0.2 // Add +/-20% jitter to reduce herd effects
};

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Apply jitter to delay to reduce retry storms.
 */
function applyJitter(delayMs, jitterRatio) {
  if (!jitterRatio) {
    return delayMs;
  }
  const jitter = delayMs * jitterRatio;
  const min = Math.max(0, delayMs - jitter);
  const max = delayMs + jitter;
  return Math.floor(min + Math.random() * (max - min));
}

/**
 * Calculate delay for retry attempt
 *
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {object} config - Retry configuration
 * @param {object} error - Tool error (optional)
 * @returns {number} - Delay in milliseconds
 */
function calculateDelay(attempt, config, error) {
  const isServiceUnavailable = error?.details?.httpStatus === 503;
  const initialDelayMs = isServiceUnavailable ? config.outageInitialDelayMs : config.initialDelayMs;
  const backoffMultiplier = isServiceUnavailable ? config.outageBackoffMultiplier : config.backoffMultiplier;
  const maxDelayMs = isServiceUnavailable ? config.outageMaxDelayMs : config.maxDelayMs;
  const delay = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);
  return applyJitter(delay, config.jitterRatio);
}

/**
 * Retry tool execution with exponential backoff
 *
 * @param {Function} executeFn - Function that returns Promise<ToolResponse>
 * @param {object} options - Retry options
 * @param {string} options.mode - 'voice' or 'text'
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {string} options.toolId - Tool identifier for logging
 * @param {object} options.toolMetadata - Tool metadata (for idempotency check)
 * @param {string} options.clientId - Client identifier for logging
 * @returns {Promise<ToolResponse>} - Tool response (may be from retry)
 */
export async function retryWithBackoff(executeFn, options = {}) {
  const {
    mode = 'text',
    maxRetries = DEFAULT_CONFIG.maxRetries,
    toolId = 'unknown',
    toolMetadata = null,
    clientId = 'unknown'
  } = options;

  // Voice mode: no retries (latency budget too tight)
  if (mode === 'voice') {
    return executeFn();
  }

  // Text mode: attempt retries for transient errors
  let lastError = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await executeFn();

      // If successful, return result
      if (result.ok) {
        if (attempt > 0) {
          console.log(`[RetryHandler] ${toolId} succeeded on attempt ${attempt + 1} (client: ${clientId})`);
        }
        return result;
      }

      // Check if error is retryable
      const error = result.error;
      if (!error.retryable) {
        if (error.details?.service === 'qdrant' && error.details?.httpStatus === 503) {
          console.log(`[RetryHandler] ${toolId} not retrying: Qdrant service unavailable (503) - ${error.message} (client: ${clientId})`);
        }
        // Not retryable - return error immediately
        if (attempt > 0) {
          console.log(`[RetryHandler] ${toolId} failed after ${attempt} retries: ${error.type} - ${error.message} (client: ${clientId})`);
        }
        return result;
      }

      // Check idempotency requirement
      if (toolMetadata && !toolMetadata.idempotent && error.idempotencyRequired) {
        // Tool requires idempotency but isn't marked as idempotent
        console.warn(`[RetryHandler] ${toolId} requires idempotency but tool is not idempotent - skipping retry (client: ${clientId})`);
        return result;
      }

      // Check for partial side effects
      if (error.partialSideEffects) {
        // Side effects occurred - don't retry
        console.warn(`[RetryHandler] ${toolId} had partial side effects - skipping retry (client: ${clientId})`);
        return result;
      }

      // Check if we've exhausted retries
      if (attempt >= maxRetries) {
        console.log(`[RetryHandler] ${toolId} failed after ${maxRetries} retries: ${error.type} - ${error.message} (client: ${clientId})`);
        return result;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, DEFAULT_CONFIG, error);
      console.log(`[RetryHandler] ${toolId} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.type} - ${error.message}. Retrying in ${delay}ms... (client: ${clientId})`);

      await sleep(delay);
      attempt++;

    } catch (error) {
      // Unexpected error from executeFn (shouldn't happen, but handle gracefully)
      console.error(`[RetryHandler] Unexpected error executing ${toolId}:`, error);
      throw error;
    }
  }

  // Should never reach here, but return last error if we do
  return lastError;
}

/**
 * Check if error is retryable based on error type
 *
 * @param {string} errorType - Error type from ErrorType enum
 * @returns {boolean} - True if error type is typically retryable
 */
export function isRetryableErrorType(errorType) {
  const retryableTypes = [
    ErrorType.TRANSIENT,
    ErrorType.RATE_LIMIT
  ];

  return retryableTypes.includes(errorType);
}

/**
 * Get retry metadata for logging
 *
 * @param {number} attempt - Current attempt number
 * @param {number} maxRetries - Maximum retries
 * @returns {object} - Retry metadata
 */
export function getRetryMetadata(attempt, maxRetries) {
  return {
    attempt: attempt + 1,
    maxAttempts: maxRetries + 1,
    isRetry: attempt > 0
  };
}
