import { toolMemoryStore } from './tool-memory-store.js';
import { toolRegistry } from './registry.js';

/**
 * ToolMemoryDedup - Pre-execution duplicate detection
 *
 * Features:
 * - Checks for similar past executions before running a tool
 * - Only checks retrieval category tools (expensive operations)
 * - Returns cached result if similarity >= threshold (85%)
 * - Includes guidance message for agent
 */
class ToolMemoryDedup {
  constructor() {
    this.SIMILARITY_THRESHOLD = 0.85; // 85% similarity required
    this.RETRIEVAL_CATEGORIES = ['retrieval']; // Tool categories to check
  }

  /**
   * Checks if a tool execution is a duplicate of a past call
   * @param {string} sessionId - Session identifier
   * @param {string} toolId - Tool ID
   * @param {object} args - Tool arguments
   * @returns {Promise<object>} - Dedup check result
   */
  async checkForDuplicate(sessionId, toolId, args) {
    // Get tool metadata
    const metadata = toolRegistry.getToolMetadata(toolId);

    if (!metadata) {
      // Unknown tool, skip dedup
      return { isDuplicate: false };
    }

    // Only check retrieval tools (expensive operations worth caching)
    if (!this.RETRIEVAL_CATEGORIES.includes(metadata.category)) {
      return { isDuplicate: false };
    }

    // Search for similar past calls
    const similarCall = toolMemoryStore.findSimilarCall(
      sessionId,
      toolId,
      args,
      this.SIMILARITY_THRESHOLD
    );

    if (!similarCall) {
      return { isDuplicate: false };
    }

    // Found a duplicate!
    console.log(`[ToolMemoryDedup] Duplicate detected for ${toolId} (call: ${similarCall.id})`);

    // Return cached result with guidance
    return {
      isDuplicate: true,
      cachedResult: similarCall.fullResponse || this.createCachedResponse(similarCall),
      guidance: this.createGuidanceMessage(toolId, similarCall),
      originalCallId: similarCall.id,
      originalTurn: similarCall.turn,
      similarity: 1.0 // We could calculate exact similarity if needed
    };
  }

  /**
   * Creates a cached response object from a similar call
   * (in case fullResponse was cleared during sliding window)
   * @param {object} call - Similar call record
   * @returns {object} - ToolResponse format
   */
  createCachedResponse(call) {
    // If fullResponse exists, use it
    if (call.fullResponse) {
      return call.fullResponse;
    }

    // Otherwise, create a response with summary info
    return {
      ok: call.ok,
      data: {
        _cached: true,
        _summary: call.summary || 'Result from previous call (full response not available)',
        _originalCallId: call.id,
        _message: 'This is a cached result. Use query_tool_memory to get full details if needed.'
      },
      error: call.error || null,
      intents: [],
      meta: {
        toolId: call.toolId,
        duration: 0, // Instant (cached)
        cached: true
      }
    };
  }

  /**
   * Creates a guidance message for the agent
   * @param {string} toolId - Tool ID
   * @param {object} call - Similar call record
   * @returns {string} - Guidance message
   */
  createGuidanceMessage(toolId, call) {
    const turnInfo = call.turn ? ` from turn ${call.turn}` : '';
    const resultInfo = call.summary || 'similar query';

    return `Reused result from previous ${toolId} call${turnInfo}: ${resultInfo}`;
  }

  /**
   * Gets deduplication statistics
   * @returns {object} - Dedup stats
   */
  getStats() {
    // This could be extended to track cache hits/misses
    return {
      similarityThreshold: this.SIMILARITY_THRESHOLD,
      retrievalCategories: this.RETRIEVAL_CATEGORIES
    };
  }
}

// Singleton instance
export const toolMemoryDedup = new ToolMemoryDedup();
