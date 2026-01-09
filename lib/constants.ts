/**
 * Application-wide constants
 */

// Storage keys
export const STORAGE_KEYS = {
  TIMEOUT: "fram_timeout_until",
  CONVERSATION: "fram_conversation",
} as const;

// Message limits
export const MESSAGE_LIMITS = {
  MAX_PERSISTED_MESSAGES: 40,
  MAX_SENT_MESSAGES: 50,
  MAX_RAW_MESSAGES: 20,
} as const;

// Timeout and blocking
export const BLOCKED_MESSAGE = "Fram has decided not to respond to you anymore as you've been rude. Fram does not take shit from anybody.";

// Cache configuration
export const CACHE_CONFIG = {
  TTL_SECONDS: 3600,
  MIN_MESSAGES_FOR_CACHE: 3,
} as const;

// Token estimation
export const TOKEN_CONFIG = {
  TOKENS_PER_CHAR: 0.25,
  MAX_TOKENS: 30000,
  SUMMARY_WORD_LIMIT: 80,
} as const;

// Stream configuration
export const STREAM_CONFIG = {
  UPDATE_INTERVAL_MS: 100,
  STREAM_TIMEOUT_MS: 60000,
  CHUNK_TIMEOUT_MS: 30000,
  MAX_BUFFER_CHUNKS: 3,
  MAX_BUFFER_MS: 150,
} as const;
