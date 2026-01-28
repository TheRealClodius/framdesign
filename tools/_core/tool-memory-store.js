import { calculateArgsSimilarity } from './utils/similarity.js';

/**
 * ToolMemoryStore - Session-scoped in-memory storage for tool execution records
 *
 * Features:
 * - Store tool execution records with full responses
 * - Sliding window: keep last 10 full, next 40 as summaries
 * - Query interface for past executions
 * - Duplicate detection via similarity matching
 */
class ToolMemoryStore {
  constructor() {
    this.sessionMemory = new Map(); // sessionId -> SessionMemory
    this.RECENT_COUNT = 10; // Keep full responses for recent calls
    this.SUMMARY_COUNT = 40; // Keep summaries for older calls
    this.MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Gets or creates a session memory object
   * @param {string} sessionId - Session identifier
   * @returns {object} - SessionMemory object
   */
  getOrCreateSession(sessionId) {
    if (!this.sessionMemory.has(sessionId)) {
      this.sessionMemory.set(sessionId, {
        sessionId,
        startTime: Date.now(),
        toolCalls: [],
        slidingWindow: {
          recentCount: this.RECENT_COUNT,
          summaryCount: this.SUMMARY_COUNT
        }
      });
    }
    return this.sessionMemory.get(sessionId);
  }

  /**
   * Records a tool execution
   * @param {string} sessionId - Session identifier
   * @param {object} record - Tool call record
   * @returns {void}
   */
  recordToolCall(sessionId, record) {
    const session = this.getOrCreateSession(sessionId);

    // Validate required fields
    if (!record.id || !record.toolId) {
      console.error('[ToolMemory] Invalid record: missing id or toolId', record);
      return;
    }

    // Add to session
    session.toolCalls.push({
      ...record,
      timestamp: record.timestamp || Date.now()
    });

    console.log(`[ToolMemory] Recorded call: ${record.toolId} (${record.id})`);

    // Apply window policy to manage memory
    this.applyWindowPolicy(sessionId);
  }

  /**
   * Queries tool calls with optional filters
   * @param {string} sessionId - Session identifier
   * @param {object} filters - Query filters
   * @param {string} filters.toolId - Filter by specific tool ID
   * @param {string} filters.timeRange - 'last_turn' | 'last_3_turns' | 'all'
   * @param {boolean} filters.includeErrors - Include failed calls
   * @returns {Array} - Array of matching tool call records
   */
  queryToolCalls(sessionId, filters = {}) {
    const session = this.sessionMemory.get(sessionId);
    if (!session) {
      return [];
    }

    let results = [...session.toolCalls];

    // Filter by tool ID
    if (filters.toolId) {
      results = results.filter(call => call.toolId === filters.toolId);
    }

    // Filter by success (exclude errors unless requested)
    if (!filters.includeErrors) {
      results = results.filter(call => call.ok);
    }

    // Filter by time range
    if (filters.timeRange) {
      const currentTurn = this.getCurrentTurn(sessionId);

      switch (filters.timeRange) {
        case 'last_turn':
          results = results.filter(call => call.turn === currentTurn);
          break;
        case 'last_3_turns':
          results = results.filter(call => call.turn >= currentTurn - 2);
          break;
        case 'all':
        default:
          // No filtering
          break;
      }
    }

    // Sort by timestamp (most recent first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    return results;
  }

  /**
   * Gets the full response for a specific call
   * @param {string} sessionId - Session identifier
   * @param {string} callId - Call ID
   * @returns {object|null} - Full tool response or null
   */
  getFullResponse(sessionId, callId) {
    const session = this.sessionMemory.get(sessionId);
    if (!session) {
      return null;
    }

    const call = session.toolCalls.find(c => c.id === callId);
    if (!call) {
      return null;
    }

    // If full response is still available, return it
    if (call.fullResponse) {
      return call.fullResponse;
    }

    // Otherwise, only summary is available
    console.log(`[ToolMemory] Full response not available for ${callId}, only summary exists`);
    return null;
  }

  /**
   * Gets a tool call record by ID
   * @param {string} sessionId - Session identifier
   * @param {string} callId - Call ID
   * @returns {object|null} - Tool call record or null
   */
  getCallRecord(sessionId, callId) {
    const session = this.sessionMemory.get(sessionId);
    if (!session) {
      return null;
    }

    return session.toolCalls.find(c => c.id === callId) || null;
  }

  /**
   * Finds a similar past call for deduplication
   * @param {string} sessionId - Session identifier
   * @param {string} toolId - Tool ID to search
   * @param {object} args - Tool arguments
   * @param {number} threshold - Similarity threshold (default 0.85)
   * @returns {object|null} - Similar call record or null
   */
  findSimilarCall(sessionId, toolId, args, threshold = 0.85) {
    const session = this.sessionMemory.get(sessionId);
    if (!session) {
      return null;
    }

    // Only check calls with the same tool ID
    const sameToolCalls = session.toolCalls.filter(call =>
      call.toolId === toolId && call.ok
    );

    for (const call of sameToolCalls) {
      const similarity = calculateArgsSimilarity(call.args, args);

      if (similarity >= threshold) {
        console.log(`[ToolMemory] Found similar call: ${call.id} (similarity: ${similarity.toFixed(2)})`);
        return call;
      }
    }

    return null;
  }

  /**
   * Applies the sliding window policy
   * - Keep last N calls with full responses
   * - Keep next M calls with summaries only
   * - Drop older calls
   * @param {string} sessionId - Session identifier
   * @returns {void}
   */
  applyWindowPolicy(sessionId) {
    const session = this.sessionMemory.get(sessionId);
    if (!session) {
      return;
    }

    const calls = session.toolCalls;
    if (calls.length === 0) {
      return;
    }

    // Sort by timestamp (newest first)
    calls.sort((a, b) => b.timestamp - a.timestamp);

    const now = Date.now();

    // Process each call based on position
    calls.forEach((call, index) => {
      // Check age - drop if too old
      const age = now - call.timestamp;
      if (age > this.MAX_AGE_MS) {
        call._markedForDeletion = true;
        return;
      }

      // Recent calls (0 to RECENT_COUNT): keep full response
      if (index < this.RECENT_COUNT) {
        call._keepFull = true;
        return;
      }

      // Older calls (RECENT_COUNT to RECENT_COUNT + SUMMARY_COUNT): summaries only
      if (index < this.RECENT_COUNT + this.SUMMARY_COUNT) {
        call._keepFull = false;
        // Clear full response to save memory (if summary exists)
        if (call.summary) {
          call.fullResponse = null;
        }
        return;
      }

      // Beyond window: mark for deletion
      call._markedForDeletion = true;
    });

    // Remove marked calls
    session.toolCalls = calls.filter(call => !call._markedForDeletion);

    // Clean up temporary flags
    session.toolCalls.forEach(call => {
      delete call._keepFull;
      delete call._markedForDeletion;
    });
  }

  /**
   * Gets the current turn number for a session
   * @param {string} sessionId - Session identifier
   * @returns {number} - Current turn number
   */
  getCurrentTurn(sessionId) {
    const session = this.sessionMemory.get(sessionId);
    if (!session || session.toolCalls.length === 0) {
      return 1;
    }

    // Find the highest turn number
    const maxTurn = Math.max(...session.toolCalls.map(call => call.turn || 1));
    return maxTurn;
  }

  /**
   * Gets calls that need summarization
   * @param {string} sessionId - Session identifier
   * @returns {Array} - Array of call IDs that need summarization
   */
  getCallsNeedingSummarization(sessionId) {
    const session = this.sessionMemory.get(sessionId);
    if (!session) {
      return [];
    }

    // Find calls that don't have summaries yet but are beyond the recent window
    const callsNeedingSummary = session.toolCalls
      .filter((call, index) => {
        // Sort first to get correct indices
        const sorted = [...session.toolCalls].sort((a, b) => b.timestamp - a.timestamp);
        const actualIndex = sorted.findIndex(c => c.id === call.id);

        // Calls beyond RECENT_COUNT need summaries
        return actualIndex >= this.RECENT_COUNT && !call.summary && call.fullResponse;
      })
      .map(call => ({
        sessionId,
        callId: call.id,
        toolId: call.toolId,
        args: call.args,
        fullResponse: call.fullResponse,
        ok: call.ok
      }));

    return callsNeedingSummary;
  }

  /**
   * Updates the summary for a specific call
   * @param {string} sessionId - Session identifier
   * @param {string} callId - Call ID
   * @param {string} summary - Generated summary
   * @returns {void}
   */
  updateSummary(sessionId, callId, summary) {
    const session = this.sessionMemory.get(sessionId);
    if (!session) {
      return;
    }

    const call = session.toolCalls.find(c => c.id === callId);
    if (!call) {
      return;
    }

    call.summary = summary;
    console.log(`[ToolMemory] Updated summary for ${callId}`);

    // Re-apply window policy to potentially clear full response
    this.applyWindowPolicy(sessionId);
  }

  /**
   * Clears all data for a session
   * @param {string} sessionId - Session identifier
   * @returns {void}
   */
  clearSession(sessionId) {
    if (this.sessionMemory.has(sessionId)) {
      const session = this.sessionMemory.get(sessionId);
      console.log(`[ToolMemory] Clearing session: ${sessionId} (${session.toolCalls.length} calls)`);
      this.sessionMemory.delete(sessionId);
    }
  }

  /**
   * Gets statistics about stored data
   * @returns {object} - Statistics object
   */
  getStats() {
    const stats = {
      totalSessions: this.sessionMemory.size,
      sessions: []
    };

    this.sessionMemory.forEach((session, sessionId) => {
      stats.sessions.push({
        sessionId,
        startTime: session.startTime,
        totalCalls: session.toolCalls.length,
        callsWithFullResponse: session.toolCalls.filter(c => c.fullResponse).length,
        callsWithSummary: session.toolCalls.filter(c => c.summary).length
      });
    });

    return stats;
  }
}

// Singleton instance
export const toolMemoryStore = new ToolMemoryStore();
