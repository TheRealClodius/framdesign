/**
 * Estimates the number of tokens in a text string
 * Uses a simple heuristic: ~4 characters = 1 token
 * This is a rough approximation for English text
 *
 * @param {string} text - Text to estimate tokens for
 * @returns {number} - Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Simple heuristic: 4 chars ≈ 1 token
  // This works reasonably well for English text
  return Math.ceil(text.length / 4);
}

/**
 * Estimates tokens for an object by first stringifying it
 * @param {any} obj - Object to estimate tokens for
 * @returns {number} - Estimated token count
 */
export function estimateTokensForObject(obj) {
  if (!obj) {
    return 0;
  }

  try {
    const text = JSON.stringify(obj);
    return estimateTokens(text);
  } catch (error) {
    console.error('[TokenEstimator] Error stringifying object:', error);
    return 0;
  }
}
