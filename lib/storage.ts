/**
 * localStorage management utilities
 */

import { STORAGE_KEYS } from "./constants";

export type Citation = {
  url: string;
  title?: string | null;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number; // Unix timestamp in milliseconds (when message was created)
  streaming?: boolean;
  isVoiceTranscript?: boolean; // Marks messages that originated from voice transcripts
  citations?: Citation[]; // Citations from web search tools (perplexity_search)
  images?: string[]; // Image markdown from kb_get/kb_search tools (voice mode)
  suggestions?: string[]; // AI-generated suggestions for this message
  // Structured tool data for accurate conversation reconstruction
  toolCalls?: Array<{
    id: string;           // Unique call ID
    name: string;         // Tool name (e.g., "kb_search")
    args: Record<string, unknown>; // Tool arguments
  }>;
  toolResults?: Array<{
    callId: string;       // Reference to tool call ID
    name: string;         // Tool name
    result: Record<string, unknown>; // Structured tool result (contains asset IDs, etc.)
  }>;
};

/**
 * Safe localStorage wrapper that handles SSR (server-side rendering)
 */
const safeStorage = {
  get(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage full or unavailable
    }
  },

  remove(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore errors
    }
  },

  getJSON<T>(key: string, fallback: T): T {
    const value = this.get(key);
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },

  setJSON(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }
};

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get or generate a persistent user ID for global budget tracking
 */
export function getUserId(): string {
  let userId = safeStorage.get(STORAGE_KEYS.USER_ID);
  if (!userId) {
    userId = `user-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
    safeStorage.set(STORAGE_KEYS.USER_ID, userId);
  }
  return userId || "server-side";
}

/**
 * Get timeout expiration timestamp from storage
 */
export function getTimeoutUntil(): number | null {
  const stored = safeStorage.get(STORAGE_KEYS.TIMEOUT);
  if (!stored) return null;

  const until = parseInt(stored, 10);
  return Date.now() < until ? until : null;
}

/**
 * Set timeout expiration timestamp in storage
 */
export function setTimeoutUntil(until: number): void {
  safeStorage.set(STORAGE_KEYS.TIMEOUT, until.toString());
}

/**
 * Clear timeout from storage
 */
export function clearTimeout(): void {
  safeStorage.remove(STORAGE_KEYS.TIMEOUT);
}

/**
 * Check if user is currently blocked by timeout
 */
export function isBlocked(): boolean {
  const until = getTimeoutUntil();
  return until !== null && Date.now() < until;
}

/**
 * Mark user as budget exhausted in storage
 */
export function setBudgetExhausted(exhausted: boolean): void {
  if (exhausted) {
    safeStorage.set(STORAGE_KEYS.BUDGET_EXHAUSTED, "true");
  } else {
    safeStorage.remove(STORAGE_KEYS.BUDGET_EXHAUSTED);
  }
}

/**
 * Check if user is marked as budget exhausted in storage
 */
export function isBudgetExhausted(): boolean {
  return safeStorage.get(STORAGE_KEYS.BUDGET_EXHAUSTED) === "true";
}

/**
 * Sanitize messages for storage (remove streaming, ensure IDs, limit count)
 */
export function sanitizeMessagesForStorage(
  messages: Message[],
  maxMessages: number
): Message[] {
  return messages
    .filter((m) => !m.streaming)
    .map((m) => (m.id ? m : { ...m, id: generateMessageId() }))
    .slice(-maxMessages);
}

/**
 * Load messages from storage
 */
export function loadMessagesFromStorage(maxMessages: number): Message[] {
  const parsedMessages = safeStorage.getJSON<Message[]>(STORAGE_KEYS.CONVERSATION, []);
  if (!Array.isArray(parsedMessages) || parsedMessages.length === 0) {
    return [];
  }
  return sanitizeMessagesForStorage(parsedMessages, maxMessages);
}

/**
 * Save messages to storage (debounced via requestIdleCallback)
 */
export function saveMessagesToStorage(
  messages: Message[],
  maxMessages: number
): void {
  if (typeof window === "undefined") return;

  const messagesToSave = sanitizeMessagesForStorage(messages, maxMessages);

  if (messagesToSave.length === 0) {
    safeStorage.remove(STORAGE_KEYS.CONVERSATION);
    return;
  }

  const save = () => {
    safeStorage.setJSON(STORAGE_KEYS.CONVERSATION, messagesToSave);
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(save);
  } else {
    save();
  }
}

/**
 * Clear all chat history from storage
 */
export function clearChatHistory(): void {
  safeStorage.remove(STORAGE_KEYS.CONVERSATION);
}
