/**
 * Simplified tool memory store
 * Keeps last N tool calls per session, FIFO eviction
 */

const MAX_CALLS_PER_SESSION = 50;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

class ToolMemoryStore {
  constructor() {
    this.sessions = new Map(); // sessionId -> { calls: [], lastAccess: timestamp }
  }

  /**
   * Get or create session
   */
  getSession(sessionId) {
    this.cleanup(); // Lazy cleanup on access

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { calls: [], lastAccess: Date.now() });
    }

    const session = this.sessions.get(sessionId);
    session.lastAccess = Date.now();
    return session;
  }

  /**
   * Record a tool call
   */
  recordToolCall(sessionId, call) {
    const session = this.getSession(sessionId);

    session.calls.push({
      id: call.id || `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      toolId: call.toolId,
      args: call.args,
      timestamp: call.timestamp || Date.now(),
      duration: call.duration,
      fullResponse: call.fullResponse,
      ok: call.ok,
      error: call.error
    });

    // FIFO eviction
    while (session.calls.length > MAX_CALLS_PER_SESSION) {
      session.calls.shift();
    }
  }

  /**
   * Get recent calls for a session
   */
  getRecentCalls(sessionId, limit = 10) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.calls.slice(-limit);
  }

  /**
   * Get full response for a specific call
   */
  getFullResponse(sessionId, callId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const call = session.calls.find(c => c.id === callId);
    return call?.fullResponse || null;
  }

  /**
   * Get calls by tool ID
   */
  getCallsByTool(sessionId, toolId, limit = 10) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.calls
      .filter(c => c.toolId === toolId)
      .slice(-limit);
  }

  /**
   * Clean up expired sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccess > SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get session statistics
   */
  getStats(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const calls = session.calls;
    const toolCounts = {};

    for (const call of calls) {
      toolCounts[call.toolId] = (toolCounts[call.toolId] || 0) + 1;
    }

    return {
      totalCalls: calls.length,
      toolBreakdown: toolCounts,
      oldestCall: calls[0]?.timestamp,
      newestCall: calls[calls.length - 1]?.timestamp
    };
  }

  /**
   * Query tool calls with filters (compatibility method)
   */
  queryToolCalls(sessionId, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    let calls = [...session.calls];

    // Filter by toolId if specified
    if (options.toolId) {
      calls = calls.filter(c => c.toolId === options.toolId);
    }

    // Filter by turn if specified
    if (options.turn !== undefined) {
      calls = calls.filter(c => c.turn === options.turn);
    }

    // Apply limit
    const limit = options.limit || 10;
    return calls.slice(-limit);
  }

  /**
   * Clear a session (compatibility method)
   */
  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}

// Export singleton
export const toolMemoryStore = new ToolMemoryStore();
