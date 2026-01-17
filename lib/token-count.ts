/**
 * Token counting utilities using tiktoken
 * Provides accurate token counting for text content
 */

import { encoding_for_model } from 'tiktoken';

// Default encoding (cl100k_base used by GPT-3.5/GPT-4)
// This provides more accurate token counting than character-based estimation
// Note: For Gemini models, this is still more accurate than char/4 approximation
const DEFAULT_ENCODING = 'cl100k_base';

// Lazy-loaded encoder instance
let encoder: ReturnType<typeof encoding_for_model> | null = null;

/**
 * Get or create the token encoder instance
 */
function getEncoder() {
  if (!encoder) {
    // Use gpt-3.5-turbo as default model (uses cl100k_base encoding)
    encoder = encoding_for_model('gpt-3.5-turbo');
  }
  return encoder;
}

/**
 * Count tokens in a text string using tiktoken
 * @param text - Text to count tokens for
 * @returns Number of tokens
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  try {
    const enc = getEncoder();
    return enc.encode(text).length;
  } catch (error) {
    // Fallback to character-based estimation if tiktoken fails
    console.warn('tiktoken failed, falling back to char estimation:', error);
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens for an array of message parts
 * @param messages - Array of messages with parts containing text
 * @returns Total token count
 */
export function countMessageTokens(
  messages: Array<{ role: string; parts: Array<{ text: string }> }>
): number {
  let total = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.text) {
        total += countTokens(part.text);
      }
    }
  }
  return total;
}

/**
 * Count tokens for a simple text string (alias for countTokens)
 * Kept for backward compatibility
 */
export function estimateTokens(text: string): number {
  return countTokens(text);
}

/**
 * Estimate total tokens for an array of message parts (alias for countMessageTokens)
 * Kept for backward compatibility
 */
export function estimateMessageTokens(
  messages: Array<{ role: string; parts: Array<{ text: string }> }>
): number {
  return countMessageTokens(messages);
}
