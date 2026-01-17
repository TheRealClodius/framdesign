/**
 * Utility Functions for Text Agent Test Tool
 */

import http from 'http';
import { encoding_for_model } from 'tiktoken';

// Lazy-loaded encoder instance
let encoder = null;

/**
 * Get or create the tiktoken encoder instance
 */
function getEncoder() {
  if (!encoder) {
    encoder = encoding_for_model('gpt-3.5-turbo');
  }
  return encoder;
}

/**
 * Count tokens in a text string using tiktoken
 * @param {string} text - Text to count tokens for
 * @returns {number} Number of tokens
 */
export function countTokens(text) {
  if (!text) return 0;
  try {
    const enc = getEncoder();
    return enc.encode(text).length;
  } catch (error) {
    console.warn('tiktoken failed, falling back to char estimation:', error);
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens for conversation history
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @returns {{total: number, breakdown: Array<{role: string, tokens: number}>}}
 */
export function countConversationTokens(messages) {
  const breakdown = messages.map(msg => ({
    role: msg.role,
    tokens: countTokens(msg.content)
  }));
  
  const total = breakdown.reduce((sum, item) => sum + item.tokens, 0);
  
  return { total, breakdown };
}

/**
 * Check if Next.js server is running on specified port
 * 
 * @param {number} port - Port to check (default: 3000)
 * @param {number} timeout - Timeout in ms (default: 5000)
 * @returns {Promise<boolean>} - True if server is running
 */
export async function checkServerRunning(port = 3000, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: '/', // Check root path
        method: 'GET',
        timeout: timeout
      },
      (res) => {
        // Any response (even 404) means server is running
        resolve(true);
      }
    );

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}
