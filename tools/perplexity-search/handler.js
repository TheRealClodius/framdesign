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
    // Trim whitespace to handle any accidental spaces/newlines
    let apiKey = (meta?.perplexityApiKey || process.env.PERPLEXITY_API_KEY)?.trim();
    
    // Debug logging
    console.log('[perplexity_search] API key check:', {
      hasMetaKey: !!meta?.perplexityApiKey,
      metaKeyLength: meta?.perplexityApiKey?.length || 0,
      hasEnvKey: !!process.env.PERPLEXITY_API_KEY,
      envKeyLength: process.env.PERPLEXITY_API_KEY?.length || 0,
      finalApiKeyPresent: !!apiKey,
      finalApiKeyLength: apiKey?.length || 0,
      keyStartsWith: apiKey?.substring(0, 4) || 'N/A',
      keyEndsWith: apiKey?.substring(apiKey.length - 4) || 'N/A'
    });
    
    if (!apiKey) {
      throw new ToolError(ErrorType.AUTH, 'PERPLEXITY_API_KEY not found in context or environment variables', {
        retryable: false
      });
    }

    // Validate key format (should start with 'pplx-')
    if (!apiKey.startsWith('pplx-')) {
      console.warn('[perplexity_search] Warning: API key does not start with "pplx-". Key format may be incorrect.');
    }

    // Prepare request body
    const requestBody = {
      model: 'sonar',
      messages: [
        {
          role: 'user',
          content: args.query
        }
      ],
      temperature: 0.2,
      max_tokens: 1000
    };

    // Debug: Log request details (without exposing full key)
    console.log('[perplexity_search] Request details:', {
      url: 'https://api.perplexity.ai/chat/completions',
      method: 'POST',
      hasAuthHeader: true,
      authHeaderPrefix: apiKey.substring(0, 8) + '...',
      model: requestBody.model,
      queryLength: args.query?.length || 0
    });

    // Call Perplexity API
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Perplexity API error: ${response.status} ${response.statusText}`;
      let errorDetails = null;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
        errorDetails = errorJson;
      } catch {
        // Use default error message if JSON parsing fails
      }
      
      console.error('[perplexity_search] API error details:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 200), // First 200 chars
        errorDetails
      });

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
