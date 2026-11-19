/**
 * Application-wide constants
 */

// Storage keys
export const STORAGE_KEYS = {
  TIMEOUT: "fram_timeout_until",
  CONVERSATION: "fram_conversation",
  USER_ID: "fram_user_id",
  BUDGET_EXHAUSTED: "fram_budget_exhausted",
} as const;

// Message limits
export const MESSAGE_LIMITS = {
  MAX_PERSISTED_MESSAGES: 40,
  MAX_SENT_MESSAGES: 50,
  MAX_RAW_MESSAGES: 20,
} as const;

// Greeting shown in the empty chat state
export const GREETING_MESSAGE = "I am Fram, the polar bear who keeps this lab's archive. FRAM designs software objects: from the Fitbit and Vector watches to UiPath's AI agents. Ask me about the work, or about one of yours.";

// Contact
export const CONTACT_EMAIL = "andrei@fram.design";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=Working%20with%20FRAM`;

// Timeout and blocking
export const BLOCKED_MESSAGE = "This conversation has ended. Fram keeps its exchanges civil. If you have a project to discuss, write to andrei@fram.design.";
export const BUDGET_EXHAUSTED_MESSAGE = "We have reached the end of what this conversation can hold. If you want to keep going, write to Andrei directly at andrei@fram.design.";

// Cache configuration
export const CACHE_CONFIG = {
  TTL_SECONDS: 3600,
  MIN_MESSAGES_FOR_CACHE: 3,
  MAX_CONVERSATION_CACHE_ENTRIES: 200,
} as const;

// Token estimation
export const TOKEN_CONFIG = {
  TOKENS_PER_CHAR: 0.25,
  MAX_TOKENS: 30000,
  MAX_GLOBAL_TOKENS_PER_USER: 300000, // Global limit across all sessions
  SUMMARY_WORD_LIMIT: 80,
} as const;

/** In-memory per-instance rate limits (see lib/services/rate-limit-service.ts) */
export const RATE_LIMIT_CONFIG = {
  CHAT_WINDOW_MS: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS) || 60_000,
  CHAT_MAX_PER_WINDOW: Number(process.env.CHAT_RATE_LIMIT_MAX) || 20,
  BUDGET_API_WINDOW_MS: Number(process.env.BUDGET_API_RATE_LIMIT_WINDOW_MS) || 60_000,
  BUDGET_API_MAX_PER_WINDOW: Number(process.env.BUDGET_API_RATE_LIMIT_MAX) || 60,
  VOICE_START_WINDOW_MS: Number(process.env.VOICE_RATE_LIMIT_WINDOW_MS) || 60_000,
  VOICE_START_MAX_PER_WINDOW: Number(process.env.VOICE_RATE_LIMIT_MAX) || 10,
} as const;

// Stream configuration
export const STREAM_CONFIG = {
  UPDATE_INTERVAL_MS: 100,
  STREAM_TIMEOUT_MS: 60000,
  CHUNK_TIMEOUT_MS: 30000,
  MAX_BUFFER_CHUNKS: 3,
  MAX_BUFFER_MS: 150,
} as const;
