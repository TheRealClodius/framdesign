/**
 * Loop Detection
 *
 * Detects when agent gets stuck:
 * 1. Same tool + same args called 3+ times in one turn
 * 2. Tool returns empty/blank results 2+ times in one turn
 */

export class LoopDetector {
  constructor() {
    // sessionId -> { turn -> [{ toolId, argsHash, result }] }
    this.turnHistory = new Map();
  }

  recordCall(sessionId, turn, toolId, args, result) {
    const key = `${sessionId}:${turn}`;
    if (!this.turnHistory.has(key)) {
      this.turnHistory.set(key, []);
    }

    const argsHash = hashArgs(args);
    this.turnHistory.get(key).push({
      toolId,
      argsHash,
      result,
      isEmpty: isEmptyResult(result)
    });
  }

  detectLoop(sessionId, turn, toolId, args) {
    const key = `${sessionId}:${turn}`;
    const history = this.turnHistory.get(key) || [];

    const argsHash = hashArgs(args);

    // Count: same tool + same args
    const sameCallCount = history.filter(
      h => h.toolId === toolId && h.argsHash === argsHash
    ).length;

    if (sameCallCount >= 2) {  // 3rd call would be a loop
      return {
        detected: true,
        type: 'SAME_CALL_REPEATED',
        message: `Loop detected: ${toolId} called ${sameCallCount + 1} times with identical arguments. Try a different approach or rephrase your query.`,
        count: sameCallCount + 1
      };
    }

    // Count: empty results from same tool
    const emptyResultCount = history.filter(
      h => h.toolId === toolId && h.isEmpty
    ).length;

    if (emptyResultCount >= 2) {
      return {
        detected: true,
        type: 'EMPTY_RESULTS_REPEATED',
        message: `${toolId} returned empty results ${emptyResultCount} times. Data may not exist. Try different search terms or a different tool.`,
        count: emptyResultCount
      };
    }

    return { detected: false };
  }

  clearTurn(sessionId, turn) {
    const key = `${sessionId}:${turn}`;
    this.turnHistory.delete(key);

    // Cleanup old turns (keep last 5 per session)
    const sessionKeys = Array.from(this.turnHistory.keys())
      .filter(k => k.startsWith(`${sessionId}:`))
      .sort();

    if (sessionKeys.length > 5) {
      sessionKeys.slice(0, sessionKeys.length - 5).forEach(k => {
        this.turnHistory.delete(k);
      });
    }
  }

  clearSession(sessionId) {
    const sessionKeys = Array.from(this.turnHistory.keys())
      .filter(k => k.startsWith(`${sessionId}:`));
    sessionKeys.forEach(k => this.turnHistory.delete(k));
  }

  getStats() {
    return {
      activeSessions: this.getActiveSessionCount(),
      totalTurnsTracked: this.turnHistory.size
    };
  }

  getActiveSessionCount() {
    const sessions = new Set();
    for (const key of this.turnHistory.keys()) {
      const sessionId = key.split(':')[0];
      sessions.add(sessionId);
    }
    return sessions.size;
  }
}

/**
 * Hash arguments for comparison
 * @param {object} args - Tool arguments
 * @returns {string} - Hash string
 */
function hashArgs(args) {
  return JSON.stringify(args);  // Simple hash for now
}

/**
 * Check if result is empty/blank
 * @param {object} result - Tool response
 * @returns {boolean} - True if empty
 */
function isEmptyResult(result) {
  if (!result || !result.ok) return false;

  const data = result.data;
  if (!data) return true;

  // Check for empty arrays/objects
  if (Array.isArray(data) && data.length === 0) return true;
  if (typeof data === 'object' && Object.keys(data).length === 0) return true;

  // Check for results array (kb_search pattern)
  if (data.results && Array.isArray(data.results) && data.results.length === 0) {
    return true;
  }

  // Check for empty strings
  if (typeof data === 'string' && data.trim().length === 0) return true;

  return false;
}

// Singleton
export const loopDetector = new LoopDetector();
