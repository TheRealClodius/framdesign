import { GoogleGenAI } from "@google/genai";
import { toolMemoryStore } from './tool-memory-store.js';

/**
 * ToolMemorySummarizer - Background async summarization service
 *
 * Features:
 * - Async summarization using Gemini Flash Nano (fast, cheap)
 * - Token budget: 150 tokens per summary
 * - FIFO queue processing
 * - Fallback summaries on error
 */
class ToolMemorySummarizer {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.TOKEN_BUDGET = 150;
    this.MODEL = 'gemini-2.5-flash-lite'; // Gemini Flash Lite - optimized for speed and cost
    this.MAX_RESPONSE_CHARS = 1000; // Truncate long responses for summarization

    // Initialize AI client
    this.init();
  }

  /**
   * Initializes or reinitializes the AI client
   * Supports both Vertex AI and Google AI Studio providers
   */
  init() {
    const VERTEXAI_PROJECT = process.env.VERTEXAI_PROJECT;
    const VERTEXAI_LOCATION = process.env.VERTEXAI_LOCATION || 'us-central1';
    const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    let aiConfig = null;

    if (GEMINI_API_KEY && GEMINI_API_KEY.trim()) {
      // Google AI Studio (API Key)
      aiConfig = { 
        apiKey: GEMINI_API_KEY 
      };
      const keySource = process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : 
                        process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' : 'GOOGLE_GENERATIVE_AI_API_KEY';
      console.log(`[ToolMemorySummarizer] Using Google AI Studio (API Key from ${keySource})`);
    } else if (VERTEXAI_PROJECT) {
      // Vertex AI Configuration (matches voice-server logic)
      aiConfig = {
        vertexai: true,
        project: VERTEXAI_PROJECT,
        location: VERTEXAI_LOCATION
      };

      if (GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          // Handle service account JSON string (common in Railway/Vercel)
          const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
          aiConfig.googleAuthOptions = {
            credentials: {
              client_email: credentials.client_email,
              private_key: credentials.private_key.replace(/\\n/g, '\n')
            }
          };
          console.log(`[ToolMemorySummarizer] Using Vertex AI (${VERTEXAI_PROJECT}) with service account from GOOGLE_APPLICATION_CREDENTIALS`);
        } catch {
          // Handle service account file path (handled automatically by SDK/ADC)
          console.log(`[ToolMemorySummarizer] Using Vertex AI (${VERTEXAI_PROJECT}) via credentials file/ADC`);
        }
      } else {
        console.log(`[ToolMemorySummarizer] Using Vertex AI (${VERTEXAI_PROJECT}) via Application Default Credentials`);
      }
    }

    if (aiConfig) {
      this.ai = new GoogleGenAI(aiConfig);
    } else {
      if (!this.ai) {
        console.warn('[ToolMemorySummarizer] No AI credentials found (Vertex AI or Gemini Key). Summarization will use fallbacks.');
      }
      this.ai = null;
    }
  }

  /**
   * Public reinitialization method
   */
  reinitialize() {
    this.init();
  }

  /**
   * Enqueues summarization tasks for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   */
  async enqueueSummarization(sessionId) {
    // Get calls that need summarization
    const callsNeedingSummary = toolMemoryStore.getCallsNeedingSummarization(sessionId);

    if (callsNeedingSummary.length === 0) {
      return;
    }

    // Add to queue
    for (const call of callsNeedingSummary) {
      this.queue.push(call);
    }

    console.log(`[ToolMemorySummarizer] Enqueued ${callsNeedingSummary.length} calls for summarization`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Processes the summarization queue
   * Runs asynchronously, doesn't block
   * @returns {Promise<void>}
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`[ToolMemorySummarizer] Processing queue: ${this.queue.length} calls`);

    while (this.queue.length > 0) {
      const call = this.queue.shift();

      try {
        const summary = await this.generateSummary(
          call.toolId,
          call.args,
          call.fullResponse,
          call.ok
        );

        // Update the tool memory store with the summary
        toolMemoryStore.updateSummary(call.sessionId, call.callId, summary);
      } catch (error) {
        console.error(`[ToolMemorySummarizer] Error summarizing ${call.callId}:`, error);

        // Use fallback summary
        const fallbackSummary = this.generateFallbackSummary(
          call.toolId,
          call.args,
          call.fullResponse,
          call.ok
        );
        toolMemoryStore.updateSummary(call.sessionId, call.callId, fallbackSummary);
      }
    }

    this.isProcessing = false;
    console.log('[ToolMemorySummarizer] Queue processing complete');
  }

  /**
   * Generates a summary for a tool execution using Gemini Flash Nano
   * @param {string} toolId - Tool ID
   * @param {object} args - Tool arguments
   * @param {object} response - Tool response
   * @param {boolean} ok - Success status
   * @returns {Promise<string>} - Summary text
   */
  async generateSummary(toolId, args, response, ok) {
    if (!this.ai) {
      // No AI client, use fallback
      return this.generateFallbackSummary(toolId, args, response, ok);
    }

    // Prepare the prompt
    const prompt = this.buildSummaryPrompt(toolId, args, response, ok);

    try {
      // Call Gemini Flash Nano
      const result = await this.ai.models.generateContent({
        model: this.MODEL,
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        config: {
          maxOutputTokens: this.TOKEN_BUDGET,
          temperature: 0.3, // Low temperature for consistent summaries
          topP: 0.95,
          topK: 40
        }
      });

      if (!result || !result.text) {
        throw new Error('No summary generated');
      }

      const summary = result.text.trim();
      console.log(`[ToolMemorySummarizer] Generated summary for ${toolId}: ${summary.substring(0, 50)}...`);

      return summary;
    } catch (error) {
      console.error(`[ToolMemorySummarizer] AI summarization failed for ${toolId}:`, error);
      // Fall back to rule-based summary
      return this.generateFallbackSummary(toolId, args, response, ok);
    }
  }

  /**
   * Builds the summarization prompt
   * @param {string} toolId - Tool ID
   * @param {object} args - Tool arguments
   * @param {object} response - Tool response
   * @param {boolean} ok - Success status
   * @returns {string} - Prompt text
   */
  buildSummaryPrompt(toolId, args, response, ok) {
    // Truncate response data if too long
    const responseStr = JSON.stringify(response?.data || {}, null, 2);
    const truncatedResponse = responseStr.length > this.MAX_RESPONSE_CHARS
      ? responseStr.substring(0, this.MAX_RESPONSE_CHARS) + '... [truncated]'
      : responseStr;

    return `Summarize this tool execution in 1-2 sentences (max 150 tokens):

Tool: ${toolId}
Arguments: ${JSON.stringify(args, null, 2)}
Response: ${truncatedResponse}
Success: ${ok}
${response?.error ? `Error: ${JSON.stringify(response.error)}` : ''}

Focus on:
1. What was queried/requested
2. Key findings or outcome
3. Any errors or empty results
4. FOR VISUAL ASSETS: State clearly if you have "PIXEL ACCESS" or "NO PIXELS".

Be concise and actionable. Max 150 tokens.`;
  }

  /**
   * Generates a fallback summary using simple rules
   * @param {string} toolId - Tool ID
   * @param {object} args - Tool arguments
   * @param {object} response - Tool response
   * @param {boolean} ok - Success status
   * @returns {string} - Fallback summary
   */
  generateFallbackSummary(toolId, args, response, ok) {
    // Extract key information
    const argsSummary = this.summarizeArgs(args);

    if (!ok) {
      const errorType = response?.error?.type || 'unknown';
      const errorMsg = response?.error?.message || 'unknown error';
      return `${toolId} failed: ${argsSummary}. Error: ${errorType} - ${errorMsg}`;
    }

    // Success case - try to extract useful info from response
    const data = response?.data;

    if (!data) {
      return `${toolId} executed: ${argsSummary}. No data returned.`;
    }

    // For search tools, mention result count
    if (toolId.includes('search') || toolId.includes('kb')) {
      const resultCount = this.countResults(data);
      if (resultCount !== null) {
        return `${toolId} executed: ${argsSummary}. Found ${resultCount} result(s).`;
      }
    }

    // For get tools, mention if data was found and visual access status
    if (toolId.includes('get')) {
      const isAsset = data.type === 'asset' || ['photo', 'diagram', 'gif'].includes(data.entity_type);
      const hasPixels = !!response._imageData || !!data._imageData;
      const visualStatus = isAsset ? (hasPixels ? ' (✅ PIXEL ACCESS)' : ' (❌ NO PIXELS)') : '';
      return `${toolId} executed: ${argsSummary}. Data retrieved successfully${visualStatus}.`;
    }

    // Generic success
    return `${toolId} executed: ${argsSummary}. Completed successfully.`;
  }

  /**
   * Summarizes tool arguments into a readable string
   * @param {object} args - Tool arguments
   * @returns {string} - Arguments summary
   */
  summarizeArgs(args) {
    if (!args || Object.keys(args).length === 0) {
      return 'no arguments';
    }

    // Extract the most important arg (usually 'query' or first arg)
    if (args.query) {
      return `query='${args.query}'`;
    }

    if (args.id) {
      return `id='${args.id}'`;
    }

    // Just show the first key-value pair
    const firstKey = Object.keys(args)[0];
    const firstValue = args[firstKey];

    if (typeof firstValue === 'string') {
      return `${firstKey}='${firstValue.substring(0, 50)}'`;
    }

    return `${firstKey}=${JSON.stringify(firstValue)}`;
  }

  /**
   * Tries to count results from response data
   * @param {any} data - Response data
   * @returns {number|null} - Result count or null if can't determine
   */
  countResults(data) {
    // Check for common result array patterns
    if (Array.isArray(data)) {
      return data.length;
    }

    if (data.results && Array.isArray(data.results)) {
      return data.results.length;
    }

    if (data.items && Array.isArray(data.items)) {
      return data.items.length;
    }

    if (data.documents && Array.isArray(data.documents)) {
      return data.documents.length;
    }

    if (typeof data.count === 'number') {
      return data.count;
    }

    return null;
  }

  /**
   * Gets current queue status
   * @returns {object} - Queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      hasAI: !!this.ai
    };
  }
}

// Singleton instance
export const toolMemorySummarizer = new ToolMemorySummarizer();
