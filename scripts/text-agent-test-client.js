/**
 * HTTP Client for Text Agent Test Tool
 * 
 * Handles POST requests to /api/chat endpoint with observability mode
 */

import http from 'http';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = 'localhost';

/**
 * Send chat request to /api/chat endpoint
 * 
 * @param {Array} messages - Conversation messages
 * @param {boolean} timeoutExpired - Whether timeout expired
 * @param {Function} onChunk - Optional callback for streaming chunks (for real-time display)
 * @returns {Promise<{text: string, observability: object|null, isJson: boolean, data?: object}>} - Response text and observability data
 */
export async function sendChatRequest(messages, timeoutExpired = false, onChunk = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      messages,
      timeoutExpired
    });

    const options = {
      hostname: DEFAULT_HOST,
      port: DEFAULT_PORT,
      path: '/api/chat?_observability=true',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 120000 // 2 minute timeout
    };

    const req = http.request(options, (res) => {
      let responseText = '';
      const contentType = res.headers['content-type'] || '';

      // Handle JSON responses (tool calls, errors)
      if (contentType.includes('application/json')) {
        let jsonData = '';
        res.on('data', (chunk) => {
          jsonData += chunk.toString();
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(jsonData);
            const observability = parsed.observability || null;
            delete parsed.observability; // Remove from main response
            
            resolve({
              text: parsed.message || parsed.error || '',
              observability,
              isJson: true,
              data: parsed
            });
          } catch (error) {
            reject(new Error(`Failed to parse JSON response: ${error.message}`));
          }
        });
        return;
      }

      // Handle streaming responses (text/plain)
      // Note: We collect all chunks first, then parse observability
      // If onChunk is provided, it can display in real-time, but we still need full text for parsing
      res.on('data', (chunk) => {
        const text = chunk.toString();
        responseText += text;
        // Only call onChunk for non-observability parts (before delimiter)
        if (onChunk && !text.includes('---OBSERVABILITY---')) {
          onChunk(text);
        }
      });

      res.on('end', () => {
        // Split on observability delimiter
        const delimiter = '---OBSERVABILITY---';
        const delimiterIndex = responseText.indexOf(delimiter);
        
        let text = responseText;
        let observability = null;

        if (delimiterIndex !== -1) {
          text = responseText.substring(0, delimiterIndex).trim();
          const observabilityText = responseText.substring(delimiterIndex + delimiter.length).trim();
          
          try {
            observability = JSON.parse(observabilityText);
          } catch (error) {
            console.warn(`Failed to parse observability data: ${error.message}`);
          }
        }

        resolve({
          text,
          observability,
          isJson: false
        });
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}
