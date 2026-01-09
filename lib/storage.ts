/**
 * localStorage management utilities
 */

import { STORAGE_KEYS } from "./constants";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get timeout expiration timestamp from storage
 */
export function getTimeoutUntil(): number | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem(STORAGE_KEYS.TIMEOUT);
  if (!stored) return null;
  
  const until = parseInt(stored, 10);
  return Date.now() < until ? until : null;
}

/**
 * Set timeout expiration timestamp in storage
 */
export function setTimeoutUntil(until: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.TIMEOUT, until.toString());
}

/**
 * Clear timeout from storage
 */
export function clearTimeout(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.TIMEOUT);
}

/**
 * Check if user is currently blocked by timeout
 */
export function isBlocked(): boolean {
  const until = getTimeoutUntil();
  return until !== null && Date.now() < until;
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
  if (typeof window === "undefined") return [];
  
  const stored = localStorage.getItem(STORAGE_KEYS.CONVERSATION);
  if (!stored) return [];
  
  try {
    const parsedMessages = JSON.parse(stored);
    if (!Array.isArray(parsedMessages) || parsedMessages.length === 0) {
      return [];
    }
    
    return sanitizeMessagesForStorage(parsedMessages, maxMessages);
  } catch (error) {
    console.error("Failed to parse stored messages:", error);
    localStorage.removeItem(STORAGE_KEYS.CONVERSATION);
    return [];
  }
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
    localStorage.removeItem(STORAGE_KEYS.CONVERSATION);
    return;
  }
  
  const save = () => {
    localStorage.setItem(STORAGE_KEYS.CONVERSATION, JSON.stringify(messagesToSave));
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
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.CONVERSATION);
}
