/**
 * perplexity_search Tool Handler
 *
 * Search the web for real-time information using Perplexity AI
 */

import { ErrorType, ToolError } from '../_core/error-types.js';

/**
 * Execute perplexity_search tool
 *
 * @param {object} context - Execution context
 * @returns {Promise<ToolResponse>} - Result envelope
 */
export async function execute(context) {
  const { args, meta } = context;
  const startTime = Date.now();

  try {
    // Get API key from context (if provided) or environment variable
    const apiKey = meta?.perplexityApiKey || process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new ToolError(ErrorType.AUTH, 'PERPLEXITY_API_KEY not found in context or environment variables', {
        retryable: false
      });
    }

    // Call Perplexity API
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: args.query
          }
        ],
        temperature: 0.2,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Perplexity API error: ${response.status} ${response.statusText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        // Use default error message if JSON parsing fails
      }

      // Classify errors
      if (response.status === 401 || response.status === 403) {
        throw new ToolError(ErrorType.AUTH, errorMessage, { retryable: false });
      }
      if (response.status === 429) {
        throw new ToolError(ErrorType.RATE_LIMIT, errorMessage, { retryable: true });
      }
      if (response.status >= 500) {
        throw new ToolError(ErrorType.TRANSIENT, errorMessage, { retryable: true });
      }
      throw new ToolError(ErrorType.PERMANENT, errorMessage, { retryable: false });
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    // Extract answer from response
    const answer = data.choices?.[0]?.message?.content || 'No answer returned from Perplexity';
    const citations = data.citations || [];

    return {
      ok: true,
      data: {
        answer,
        citations,
        query: args.query,
        model: data.model || 'sonar'
      },
      meta: {
        latency,
        tokens_used: data.usage?.total_tokens || null
      }
    };
  } catch (error) {
    // Propagate ToolErrors, wrap unexpected errors
    if (error.name === 'ToolError') {
      throw error;
    }

    // Handle network errors
    const errorMessage = error.message || String(error);
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      throw new ToolError(ErrorType.TRANSIENT, `Network error: ${errorMessage}`, {
        retryable: true
      });
    }

    throw new ToolError(ErrorType.INTERNAL, `Unexpected error: ${errorMessage}`, {
      retryable: false
    });
  }
}
