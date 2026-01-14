import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { FRAM_SYSTEM_PROMPT } from "@/lib/config";
import { createHash } from "crypto";
import { handleServerError, isRetryableError } from "@/lib/errors";
import {
  CACHE_CONFIG,
  MESSAGE_LIMITS,
  TOKEN_CONFIG,
  STREAM_CONFIG,
} from "@/lib/constants";
import { toolRegistry } from '@/tools/_core/registry.js';
import { ErrorType, ToolError } from '@/tools/_core/error-types.js';
import { createStateController } from '@/tools/_core/state-controller.js';
import { retryWithBackoff as retryToolExecution } from '@/tools/_core/retry-handler.js';

// Convert geminiNative schema (with uppercase string types like "OBJECT", "STRING") 
// to JSON Schema format (lowercase: "object", "string") for parametersJsonSchema
function convertGeminiSchemaToJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }
  
  const TYPE_MAP: Record<string, string> = {
    'STRING': 'string',
    'NUMBER': 'number',
    'INTEGER': 'integer',
    'BOOLEAN': 'boolean',
    'OBJECT': 'object',
    'ARRAY': 'array'
  };
  
  // Create a copy to avoid mutating the original
  const converted: any = { ...schema };
  
  // Convert uppercase type to lowercase JSON Schema type
  if (schema.type && typeof schema.type === 'string') {
    const upperType = schema.type.toUpperCase();
    if (TYPE_MAP[upperType]) {
      converted.type = TYPE_MAP[upperType];
    }
  }
  
  // Recursively convert properties
  if (schema.properties && typeof schema.properties === 'object') {
    converted.properties = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      converted.properties[key] = convertGeminiSchemaToJsonSchema(prop);
    }
  }
  
  // Recursively convert items for arrays
  if (schema.items) {
    converted.items = convertGeminiSchemaToJsonSchema(schema.items);
  }
  
  // Preserve other fields (enum, description, required, etc.)
  return converted;
}

// In-memory cache store for conversation caches
// Key: conversation hash, Value: { cacheName: string, cachedMessageCount: number, summary: string | null, summaryUpToIndex: number, createdAt: number }
const conversationCacheStore = new Map<string, { 
  cacheName: string; 
  cachedMessageCount: number; 
  summary: string | null;
  summaryUpToIndex: number;
  createdAt: number 
}>();

// Shared system prompt cache (created once, reused)
let systemPromptCache: string | null = null;
let systemPromptCachePromise: Promise<string | null> | null = null;
let systemPromptHash: string | null = null; // Hash of the system prompt to detect changes

/**
 * Estimates token count for a string (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKEN_CONFIG.TOKENS_PER_CHAR);
}

/**
 * Estimates total tokens for an array of message parts
 */
function estimateMessageTokens(messages: Array<{ role: string; parts: Array<{ text: string }> }>): number {
  let total = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      total += estimateTokens(part.text);
    }
  }
  return total;
}

/**
 * Creates a hash of the conversation history to identify unique conversations
 * The hash is stable across messages in the same conversation, only changing
 * when the conversation fundamentally changes (first messages or timeout state)
 */
function hashConversation(messages: Array<{ role: string; content: string }>, timeoutExpired: boolean): string {
  // Create a stable hash based on a richer slice of the conversation and timeout state
  const firstMessages = messages.slice(0, 5).map(m => ({
    role: m.role,
    content: m.content.substring(0, 500)
  }));
  const key = JSON.stringify({
    firstMessages,
    timeoutExpired
  });
  
  // Use Node.js crypto module (Next.js API routes run in Node.js runtime by default)
  const hash = createHash('sha256').update(key).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Summarizes old messages using Gemini API
 * Returns a concise summary of the conversation history
 */
async function summarizeMessages(
  ai: GoogleGenAI,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    // Build prompt for summarization
    const conversationText = messages
      .map((msg) => `${msg.role === "user" ? "User" : "Fram"}: ${msg.content}`)
      .join("\n\n");

    const summaryPrompt = `Please provide a concise summary of the following conversation. Focus on key topics discussed, important information shared, and the overall context. Keep it brief but informative (aim for 200-400 words):

${conversationText}

Summary:`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        role: "user" as const,
        parts: [{ text: summaryPrompt }],
      }],
    });

    // Extract summary text from response
    // The response structure has candidates[0].content.parts[0].text
    const summaryText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Previous conversation context.";
    console.log(`Generated summary (${summaryText.length} chars, ~${estimateTokens(summaryText)} tokens)`);
    return summaryText;
  } catch (error) {
    console.error("Failed to summarize messages:", error);
    // Fallback: return a simple note
    return `Previous conversation with ${messages.length} messages.`;
  }
}

/**
 * Creates a hash of the system prompt to detect changes
 */
function hashSystemPrompt(prompt: string): string {
  const hash = createHash('sha256').update(prompt).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Trims text to a maximum word count.
 */
function trimToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ") + "…";
}

/**
 * Enforce token budget by trimming summary and dropping oldest context items.
 */
function enforceTokenBudget(
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  summary: string | null,
  maxTokens: number
): {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  summary: string | null;
  droppedMessages: number;
  summaryTrimmed: boolean;
} {
  let adjustedContents = [...contents];
  let adjustedSummary = summary;
  let summaryTrimmed = false;
  let droppedMessages = 0;

  let tokens = estimateMessageTokens(adjustedContents);
  if (tokens <= maxTokens) {
    return { contents: adjustedContents, summary: adjustedSummary, droppedMessages, summaryTrimmed };
  }

  // Trim summary first if present
  if (adjustedSummary) {
    const trimmed = trimToWords(adjustedSummary, TOKEN_CONFIG.SUMMARY_WORD_LIMIT);
    if (trimmed !== adjustedSummary) {
      adjustedSummary = trimmed;
      adjustedContents = adjustedContents.map((msg) => {
        if (msg.role === "user" && msg.parts?.[0]?.text?.startsWith("PREVIOUS CONVERSATION SUMMARY:")) {
          return {
            ...msg,
            parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${trimmed}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }]
          };
        }
        return msg;
      });
      summaryTrimmed = true;
      tokens = estimateMessageTokens(adjustedContents);
    }
  }

  // Drop oldest messages until within budget (leave at least one)
  while (tokens > maxTokens && adjustedContents.length > 1) {
    adjustedContents.shift();
    droppedMessages += 1;
    tokens = estimateMessageTokens(adjustedContents);
  }

  return { contents: adjustedContents, summary: adjustedSummary, droppedMessages, summaryTrimmed };
}

/**
 * Creates or retrieves the system prompt cache
 * Automatically invalidates and recreates cache if system prompt changes
 */
async function getSystemPromptCache(ai: GoogleGenAI, providerSchemas: any[]): Promise<string | null> {
  // Calculate current system prompt hash
  const currentPromptHash = hashSystemPrompt(FRAM_SYSTEM_PROMPT);
  
  // If system prompt changed, invalidate the cache
  if (systemPromptHash !== null && systemPromptHash !== currentPromptHash) {
    console.log("System prompt changed, invalidating cache");
    systemPromptCache = null;
    systemPromptCachePromise = null;
    // Note: We don't delete the old cache from Gemini API - it will expire naturally
  }
  
  // Update hash to current
  systemPromptHash = currentPromptHash;

  // If cache creation is in progress, wait for it
  if (systemPromptCachePromise) {
    return systemPromptCachePromise;
  }

  // If cache already exists, return it
  if (systemPromptCache) {
    return systemPromptCache;
  }

  // Create new cache
  systemPromptCachePromise = (async () => {
    try {
      // Check if caches API is available
      if (!ai.caches || typeof ai.caches.create !== 'function') {
        console.warn("Cache API not available in this SDK version");
        return null;
      }

      // Build system prompt content with acknowledgment
      const systemContent = [
        {
          role: "user" as const,
          parts: [{ text: FRAM_SYSTEM_PROMPT }],
        },
        {
          role: "model" as const,
          parts: [{ text: "UNDERSTOOD." }],
        }
      ];

      // Check token count first (optional, but good practice)
      // Note: gemini-3-flash-preview might not support caching yet
      // We'll try to create cache, but fall back gracefully if it fails
      // Include tools in cache so we don't need to pass them when using cached content
      const cache = await ai.caches.create({
        model: "gemini-3-flash-preview", // Try with preview model
        config: {
          systemInstruction: FRAM_SYSTEM_PROMPT,
          contents: systemContent,
          tools: [{ functionDeclarations: providerSchemas }],
          ttl: `${CACHE_CONFIG.TTL_SECONDS}s`,
          displayName: "fram-system-prompt"
        }
      });

      systemPromptCache = cache.name || null;
      console.log("System prompt cache created:", cache.name);
      return cache.name || null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.warn("Failed to create system prompt cache (may not be supported for this model):", errorMessage);
      if (errorStack) {
        console.warn("Stack trace:", errorStack);
      }
      // Cache creation failed - likely model doesn't support caching yet
      // Return null to fall back to non-cached approach
      return null;
    } finally {
      systemPromptCachePromise = null;
    }
  })();

  return systemPromptCachePromise;
}

/**
 * Creates or retrieves a conversation cache for the given history
 * Returns cache name and messages to send (summary context + recent messages)
 */
async function getConversationCache(
  ai: GoogleGenAI,
  conversationHash: string,
  summary: string | null,
  recentMessages: Array<{ role: string; parts: Array<{ text: string }> }>,
  summaryUpToIndex: number,
  providerSchemas: any[]
): Promise<{ 
  cacheName: string | null; 
  summaryCacheName: string | null;
  contentsToSend: Array<{ role: string; parts: Array<{ text: string }> }>;
  summary: string | null;
}> {
  const cached = conversationCacheStore.get(conversationHash);

  // Check if we have a valid cache
  if (cached) {
    const age = Date.now() - cached.createdAt;
    const ageSeconds = age / 1000;
    
    // If cache is still valid
    if (ageSeconds < CACHE_CONFIG.TTL_SECONDS) {
      // Check if summary has changed (conversation grew beyond previous summary point)
      if (summary && cached.summary !== summary) {
        // Summary changed, need to update cache
        console.log("Summary updated, recreating summary cache");
        // Delete old cache
        try {
          if (ai.caches && typeof ai.caches.delete === 'function' && cached.cacheName) {
            await ai.caches.delete({ name: cached.cacheName });
          }
        } catch (error) {
          console.warn("Failed to delete old summary cache:", error instanceof Error ? error.message : String(error));
        }
        // Will fall through to create new cache below
      } else {
        // Cache is valid, return it with recent messages
        return { 
          cacheName: cached.cacheName, 
          summaryCacheName: cached.summary ? cached.cacheName : null,
          contentsToSend: recentMessages,
          summary: cached.summary
        };
      }
    } else {
      // Cache expired, remove it
      conversationCacheStore.delete(conversationHash);
      try {
        if (ai.caches && typeof ai.caches.delete === 'function' && cached.cacheName) {
          await ai.caches.delete({ name: cached.cacheName });
        }
      } catch (error) {
        console.warn("Failed to delete expired cache:", error instanceof Error ? error.message : String(error));
      }
    }
  }

  // Create new cache if we have a summary to cache
  if (summary) {
    try {
      // Check if caches API is available
      if (!ai.caches || typeof ai.caches.create !== 'function') {
        console.warn("Cache API not available in this SDK version");
        // Build contents with summary context
        const contentsToSend: Array<{ role: string; parts: Array<{ text: string }> }> = [
          {
            role: "user",
            parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${summary}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }],
          },
          {
            role: "model",
            parts: [{ text: "ACKNOWLEDGED. CONTINUING FROM SUMMARY." }],
          },
          ...recentMessages
        ];
        return { cacheName: null, summaryCacheName: null, contentsToSend, summary };
      }

      // Build cache content: system prompt + summary acknowledgment
      const cacheContent = [
        {
          role: "user" as const,
          parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${summary}` }],
        },
        {
          role: "model" as const,
          parts: [{ text: "ACKNOWLEDGED. CONTINUING FROM SUMMARY." }],
        }
      ];

      // Include tools in cache so we don't need to pass them when using cached content
      const cache = await ai.caches.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: FRAM_SYSTEM_PROMPT,
          contents: cacheContent,
          tools: [{ functionDeclarations: providerSchemas }],
          ttl: `${CACHE_CONFIG.TTL_SECONDS}s`,
          displayName: `fram-summary-${conversationHash}`
        }
      });

      // Store cache reference
      const cacheName = cache.name || null;
      conversationCacheStore.set(conversationHash, {
        cacheName: cacheName || "",
        cachedMessageCount: summaryUpToIndex,
        summary: summary,
        summaryUpToIndex: summaryUpToIndex,
        createdAt: Date.now()
      });

      console.log(`Summary cache created: ${cacheName} (summary up to index ${summaryUpToIndex})`);
      
      // Return cache with recent messages to send
      return { 
        cacheName: cacheName, 
        summaryCacheName: cacheName,
        contentsToSend: recentMessages,
        summary: summary
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.warn("Failed to create summary cache:", errorMessage);
      if (errorStack) {
        console.warn("Stack trace:", errorStack);
      }
      // Fall back to non-cached approach with summary
      const contentsToSend: Array<{ role: string; parts: Array<{ text: string }> }> = [
        {
          role: "user",
          parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${summary}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }],
        },
        {
          role: "model",
          parts: [{ text: "ACKNOWLEDGED. CONTINUING FROM SUMMARY." }],
        },
        ...recentMessages
      ];
      return { cacheName: null, summaryCacheName: null, contentsToSend, summary };
    }
  }

  // No summary yet, return recent messages only
  return { cacheName: null, summaryCacheName: null, contentsToSend: recentMessages, summary: null };
}

// Helper function to retry API calls with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      
      if (!isRetryableError(error) || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, timeoutExpired } = body;

    const apiKey = process.env.GEMINI_API_KEY;

    // Log for debugging (API key presence, not the key itself)
    console.log("GEMINI_API_KEY present:", !!apiKey);
    console.log("GEMINI_API_KEY length:", apiKey ? apiKey.length : 0);

    if (!apiKey) {
      // Return a mock response if no API key is configured
      console.error("GEMINI_API_KEY is missing!");
      return NextResponse.json({
        message: "I AM A DEMO AI ASSISTANT. PLEASE CONFIGURE THE GEMINI_API_KEY ENVIRONMENT VARIABLE TO ENABLE REAL RESPONSES."
      });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Load registry if not already loaded
    if (!toolRegistry.getVersion()) {
      await toolRegistry.load();
      toolRegistry.lock();
      console.log(`✓ Tool registry loaded: v${toolRegistry.getVersion()}`);
    }

    // Get provider schemas for Gemini 3
    // Convert geminiNative format (uppercase types) to JSON Schema format (lowercase types)
    // Use parametersJsonSchema instead of parameters to avoid Type.* enum conversion
    const geminiNativeSchemas = toolRegistry.getProviderSchemas('geminiNative');
    const providerSchemas = geminiNativeSchemas.map(schema => {
      // Convert to JSON Schema format and use parametersJsonSchema
      const jsonSchema = convertGeminiSchemaToJsonSchema(schema.parameters);
      return {
        name: schema.name,
        description: schema.description,
        parametersJsonSchema: jsonSchema  // Use JSON Schema format instead of Type.* enums
      };
    });

    // Enable caching
    const ENABLE_CACHING = true;

    // Get conversation hash for cache tracking
    const conversationHash = hashConversation(messages, timeoutExpired);
    const cached = conversationCacheStore.get(conversationHash);

    // Implement message windowing: keep last MAX_RAW_MESSAGES messages
    const totalMessages = messages.length;
    let rawMessages: Array<{ role: string; content: string }>;
    let messagesToSummarize: Array<{ role: string; content: string }> = [];
    let summary: string | null = null;
    let summaryUpToIndex = 0;

    // Background summarization promise (doesn't block streaming)
    let summaryPromise: Promise<string | null> | null = null;

    if (totalMessages > MESSAGE_LIMITS.MAX_RAW_MESSAGES) {
      // Split: old messages to summarize, recent messages to keep raw
      const splitIndex = totalMessages - MESSAGE_LIMITS.MAX_RAW_MESSAGES;
      messagesToSummarize = messages.slice(0, splitIndex);
      rawMessages = messages.slice(splitIndex);
      summaryUpToIndex = splitIndex;

      // Check if we need to generate/update summary
      const needsNewSummary = !cached || !cached.summary || cached.summaryUpToIndex < splitIndex;

      if (needsNewSummary) {
        console.log(`Scheduling background summarization of ${messagesToSummarize.length} old messages`);
        // Start summarization in background, don't await it
        summaryPromise = summarizeMessages(ai, messagesToSummarize);
        // Use existing summary for now (if available)
        summary = cached?.summary || null;
      } else {
        // Reuse existing summary
        summary = cached.summary;
        console.log(`Reusing existing summary (up to index ${cached.summaryUpToIndex})`);
      }
    } else {
      // Not enough messages to summarize yet
      rawMessages = messages;
      summary = null;
      summaryUpToIndex = 0;
    }

    // Build recent messages in Gemini format (last MAX_RAW_MESSAGES)
    const recentMessages: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // If a timeout just expired, add context about it BEFORE the recent messages
    if (timeoutExpired) {
      recentMessages.push({
        role: "user",
        parts: [{ text: "IMPORTANT CONTEXT: A TIMEOUT HAS JUST EXPIRED. THE USER HAS SERVED THEIR TIME FOR PREVIOUS OFFENSES. OLD MESSAGES IN THE CONVERSATION HISTORY THAT LED TO THE TIMEOUT ARE CONSIDERED RESOLVED. ONLY EVALUATE THE USER BASED ON THEIR CURRENT AND RECENT BEHAVIOR AFTER THIS POINT. GIVE THEM A FRESH START UNLESS THEY COMMIT NEW OFFENSES." }],
      });
      recentMessages.push({
        role: "model",
        parts: [{ text: "ACKNOWLEDGED. TIMEOUT EXPIRED. EVALUATING ONLY CURRENT BEHAVIOR." }],
      });
    }

    // Convert recent raw messages to Gemini format
    for (const msg of rawMessages) {
      if (msg.content && msg.content.trim()) {
        recentMessages.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Try to use caching for better performance and cost savings
    // OPTIMIZATION: Use fast path with existing cache, update in background
    let contentsToSend: Array<{ role: string; parts: Array<{ text: string }> }>;
    let cachedContent: string | undefined;

    if (ENABLE_CACHING) {
      try {
        // Fast path: Check if we already have a valid cache
        if (cached) {
          const age = Date.now() - cached.createdAt;
          const ageSeconds = age / 1000;
          
          if (ageSeconds < CACHE_CONFIG.TTL_SECONDS) {
            // Use existing cache immediately, don't wait for updates
            if (cached.summary) {
              contentsToSend = recentMessages;
              cachedContent = cached.cacheName;
              console.log(`Fast path: Using existing summary cache (age: ${ageSeconds.toFixed(1)}s)`);
            } else {
              // Try to get system cache (fast operation)
              const systemCache = await Promise.race([
                getSystemPromptCache(ai, providerSchemas),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)) // 100ms timeout
              ]);
              contentsToSend = recentMessages;
              cachedContent = systemCache || undefined;
              console.log(`Fast path: Using system cache, no summary yet`);
            }
            
            // Background: Update cache if needed (don't await)
            if (summaryPromise) {
              console.log("Background: Will update cache with new summary after streaming");
            }
          } else {
            // Cache expired, fall through to slow path
            console.log("Cache expired, using slow path");
            throw new Error("Cache expired");
          }
        } else {
          // No existing cache, use slow path (but make it faster with timeouts)
          console.log("No existing cache, initializing...");
          
          // Get system prompt cache with timeout
          const systemCache = await Promise.race([
            getSystemPromptCache(ai, providerSchemas),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)) // 200ms timeout
          ]);
          
          if (summary) {
            contentsToSend = [
              {
                role: "user",
                parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${summary}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }],
              },
              {
                role: "model",
                parts: [{ text: "ACKNOWLEDGED. CONTINUING FROM SUMMARY." }],
              },
              ...recentMessages
            ];
          } else {
            contentsToSend = recentMessages;
          }
          cachedContent = systemCache || undefined;
          console.log(`Initialized cache, sending ${contentsToSend.length} messages`);
          
          // Background: Create conversation cache for next time (don't await)
          if (summary) {
            getConversationCache(ai, conversationHash, summary, recentMessages, summaryUpToIndex, providerSchemas)
              .catch((err) => console.warn("Background cache creation failed:", err));
          }
        }

        // Log token estimates
        const estimatedTokens = estimateMessageTokens(contentsToSend);
        console.log(`Estimated tokens: ~${estimatedTokens} (limit: ${TOKEN_CONFIG.MAX_TOKENS})`);
        if (estimatedTokens > TOKEN_CONFIG.MAX_TOKENS) {
          console.warn(`WARNING: Estimated tokens (${estimatedTokens}) exceed safety limit (${TOKEN_CONFIG.MAX_TOKENS})`);
        }
      } catch (cacheError) {
        // If cache operations fail, fall back to non-cached approach
        console.warn("Cache operations failed, falling back to non-cached approach:", cacheError);
        if (summary) {
          contentsToSend = [
            {
              role: "user",
              parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${summary}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }],
            },
            {
              role: "model",
              parts: [{ text: "ACKNOWLEDGED. CONTINUING FROM SUMMARY." }],
            },
            ...recentMessages
          ];
        } else {
          contentsToSend = recentMessages;
        }
        cachedContent = undefined;
      }
    } else {
      // Caching disabled - send summary + recent messages
      if (summary) {
        contentsToSend = [
          {
            role: "user",
            parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${summary}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }],
          },
          {
            role: "model",
            parts: [{ text: "ACKNOWLEDGED. CONTINUING FROM SUMMARY." }],
          },
          ...recentMessages
        ];
      } else {
        contentsToSend = recentMessages;
      }
      cachedContent = undefined;
      console.log("Caching disabled, sending summary + recent messages");
    }

    // Enforce token budget after cache decisions
    const budgetResult = enforceTokenBudget(contentsToSend, summary, TOKEN_CONFIG.MAX_TOKENS);
    contentsToSend = budgetResult.contents;
    summary = budgetResult.summary;
    if (budgetResult.summaryTrimmed) {
      console.log(`Summary trimmed to ${TOKEN_CONFIG.SUMMARY_WORD_LIMIT} words for token budget`);
    }
    if (budgetResult.droppedMessages > 0) {
      console.log(`Dropped ${budgetResult.droppedMessages} oldest message(s) to fit token budget`);
    }

    // Generate response with streaming (with retry logic)
    const stream = await retryWithBackoff(async () => {
      const estimatedTokens = estimateMessageTokens(contentsToSend);
      console.log("=== Gemini API Request ===");
      console.log("Model: gemini-3-flash-preview (streaming)");
      console.log("Messages to send:", contentsToSend.length);
      console.log("Estimated tokens:", estimatedTokens);
      console.log("Using cached content:", cachedContent || "none");
      console.log("Summary present:", summary ? `Yes (${summary.length} chars)` : "No");
      console.log("Recent messages:", recentMessages.length);
      if (summary) {
        console.log(`Context breakdown: Summary (~${estimateTokens(summary)} tokens) + ${recentMessages.length} recent messages (~${estimateMessageTokens(recentMessages)} tokens)`);
      }

      // When using cached content, tools must be included in the cache, not in the request
      // So we conditionally include tools based on whether we're using cached content
      const config: {
        tools?: Array<{ functionDeclarations: any[] }>;
        cachedContent?: string;
        systemInstruction?: string;
      } = {};

      // Add cached content reference if available
      // Only add if cachedContent is truthy and not empty
      if (cachedContent && cachedContent.trim()) {
        try {
          // When using cached content, tools are already in the cache, so don't include them here
          config.cachedContent = cachedContent;
        } catch (e) {
          console.warn("Failed to set cachedContent in config:", e);
          // Continue without cache - will add tools below
        }
      }

      const usingCache = !!cachedContent && !!cachedContent.trim();

      // Only add tools/systemInstruction if we're NOT using cached content (tools live in cache when present)
      if (!usingCache) {
        config.tools = [{ functionDeclarations: providerSchemas }];
        config.systemInstruction = FRAM_SYSTEM_PROMPT;
      }

      const result = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview", // Gemini 3 Flash Preview
        contents: contentsToSend,
        config
      });
      
      console.log("Gemini API stream created");
      return result;
    });

    // Check early chunks for function calls, then stream progressively to the client
    // Store the full functionCall part including thought_signature (required by Gemini 3)
    let functionCall: { name: string; args: Record<string, unknown>; thought_signature?: string } | null = null;
    // Store the full functionCall part as returned by the model (preserves thought_signature)
    let functionCallPart: { functionCall: { name: string; args: Record<string, unknown>; thought_signature?: string } } | null = null;
    const bufferedChunks: unknown[] = [];

    try {
      const iterator = stream[Symbol.asyncIterator]();
      const bufferStart = Date.now();

      // Buffer a few chunks (or up to time limit) to detect function calls before streaming
      while (bufferedChunks.length < STREAM_CONFIG.MAX_BUFFER_CHUNKS && Date.now() - bufferStart < STREAM_CONFIG.MAX_BUFFER_MS) {
        const { value, done } = await iterator.next();
        if (done) break;
        bufferedChunks.push(value);

        const typed = value as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown>; thought_signature?: string } }> } }> };
        const candidates = typed.candidates?.[0]?.content?.parts || [];
        const callPart = candidates.find((part) => part.functionCall);
        if (callPart?.functionCall) {
          functionCall = callPart.functionCall;
          // Preserve the entire part including thought_signature for follow-up requests
          functionCallPart = callPart as { functionCall: { name: string; args: Record<string, unknown>; thought_signature?: string } };
          break;
        }
      }

      // If function call detected early, handle it and return JSON (no stream)
      if (functionCall?.name === "ignore_user") {
        // Initialize state controller
        const state = createStateController({
          mode: 'text',
          isActive: true
        }) as any;

        // Get tool metadata
        const toolMetadata = toolRegistry.getToolMetadata('ignore_user') as any;

        // Build execution context
        const executionContext = {
          clientId: `text-${Date.now()}`,
          ws: null,  // No WebSocket in text mode
          geminiSession: null,
          args: functionCall.args,
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          }
        };

        // Execute tool through registry with retry logic
        const startTime = Date.now();
        const result = await retryToolExecution(
          () => toolRegistry.executeTool('ignore_user', executionContext),
          {
            mode: 'text',
            maxRetries: 3,
            toolId: 'ignore_user',
            toolMetadata: toolMetadata,
            clientId: `text-${Date.now()}`
          }
        );
        const duration = Date.now() - startTime;

        // Structured audit logging
        console.log(JSON.stringify({
          event: 'tool_execution',
          toolId: 'ignore_user',
          toolVersion: toolMetadata?.version || 'unknown',
          registryVersion: toolRegistry.getVersion(),
          duration,
          ok: result.ok,
          category: toolMetadata?.category || 'unknown',
          mode: 'text'
        }));

        // Return response based on result
        if (result.ok) {
          return NextResponse.json({
            message: result.data.farewellMessage || functionCall.args.farewell_message,
            timeout: {
              duration: result.data.durationSeconds || functionCall.args.duration_seconds,
              until: result.data.timeoutUntil
            }
          });
        } else {
          console.error('ignore_user tool failed:', result.error);
          return NextResponse.json({
            error: result.error.message
          }, { status: 500 });
        }
      }

      // Handle start_voice_session tool call
      if (functionCall?.name === "start_voice_session") {
        // Initialize state controller
        const state = createStateController({
          mode: 'text',
          isActive: true
        }) as any;

        const toolMetadata = toolRegistry.getToolMetadata('start_voice_session') as any;

        const executionContext = {
          clientId: `text-${Date.now()}`,
          ws: null,
          geminiSession: null,
          args: functionCall.args || {},
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          }
        };

        const startTime = Date.now();
        const result = await retryToolExecution(
          () => toolRegistry.executeTool('start_voice_session', executionContext),
          {
            mode: 'text',
            maxRetries: 3,
            toolId: 'start_voice_session',
            toolMetadata: toolMetadata,
            clientId: `text-${Date.now()}`
          }
        );
        const duration = Date.now() - startTime;

        console.log(JSON.stringify({
          event: 'tool_execution',
          toolId: 'start_voice_session',
          toolVersion: toolMetadata?.version || 'unknown',
          registryVersion: toolRegistry.getVersion(),
          duration,
          ok: result.ok,
          category: toolMetadata?.category || 'unknown',
          mode: 'text'
        }));

        if (result.ok) {
          const pendingRequest = functionCall.args?.pending_request || null;

          // Extract text response from buffered chunks
          let messageText = "";
          for (const chunk of bufferedChunks) {
            const typed = chunk as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
            const candidates = typed.candidates?.[0]?.content?.parts || [];
            for (const part of candidates) {
              if (part.text) {
                messageText += part.text;
              }
            }
          }

          if (!messageText.trim()) {
            messageText = "Let's switch to voice mode.";
          }

          return NextResponse.json({
            message: messageText,
            startVoiceSession: true,
            pendingRequest: pendingRequest
          });
        } else {
          console.error('start_voice_session tool failed:', result.error);
          return NextResponse.json({
            error: result.error.message
          }, { status: 500 });
        }
      }

      // Handle other function calls (e.g., kb_search, kb_get)
      if (functionCall && functionCall.name) {
        const toolName = functionCall.name; // Store in const for type narrowing
        console.log(`Handling function call: ${toolName}`);
        
        // Initialize state controller
        const state = createStateController({
          mode: 'text',
          isActive: true
        }) as any;

        // Get tool metadata
        const toolMetadata = toolRegistry.getToolMetadata(toolName) as any;
        
        if (!toolMetadata) {
          console.error(`Unknown tool: ${toolName}`);
          return NextResponse.json({
            error: `Unknown tool: ${toolName}`
          }, { status: 400 });
        }

        // Build execution context
        const executionContext = {
          clientId: `text-${Date.now()}`,
          ws: null,
          geminiSession: null,
          args: functionCall.args || {},
          capabilities: { voice: false },
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          }
        };

        // Execute tool through registry with retry logic
        const startTime = Date.now();
        const result = await retryToolExecution(
          () => toolRegistry.executeTool(toolName, executionContext),
          {
            mode: 'text',
            maxRetries: 3,
            toolId: toolName,
            toolMetadata: toolMetadata,
            clientId: `text-${Date.now()}`
          }
        );
        const duration = Date.now() - startTime;

        console.log(JSON.stringify({
          event: 'tool_execution',
          toolId: toolName,
          toolVersion: toolMetadata?.version || 'unknown',
          registryVersion: toolRegistry.getVersion(),
          duration,
          ok: result.ok,
          category: toolMetadata?.category || 'unknown',
          mode: 'text'
        }));

        if (!result.ok) {
          console.error(`${toolName} tool failed:`, result.error);
          return NextResponse.json({
            error: result.error.message
          }, { status: 500 });
        }

        // Continue conversation with tool result
        // Add the function call and result to the conversation
        // IMPORTANT: Use the full functionCallPart which includes thought_signature (required by Gemini 3)
        const updatedContents = [
          ...contentsToSend,
          {
            role: "model" as const,
            parts: [
              // Use the preserved functionCallPart which includes thought_signature
              functionCallPart || {
                functionCall: {
                  name: toolName,
                  args: functionCall.args || {}
                }
              }
            ]
          },
          {
            role: "user" as const,
            parts: [
              {
                functionResponse: {
                  name: toolName,
                  response: result.data
                }
              }
            ]
          }
        ];

        // Make a new API call with the tool result
        const followUpStream = await retryWithBackoff(async () => {
          const config: {
            tools?: Array<{ functionDeclarations: any[] }>;
            cachedContent?: string;
            systemInstruction?: string;
          } = {};

          // Use cached content if available
          if (cachedContent && cachedContent.trim()) {
            config.cachedContent = cachedContent;
          } else {
            config.tools = [{ functionDeclarations: providerSchemas }];
            config.systemInstruction = FRAM_SYSTEM_PROMPT;
          }

          return await ai.models.generateContentStream({
            model: "gemini-3-flash-preview",
            contents: updatedContents,
            config
          });
        });

        // Stream the follow-up response
        return new Response(
          new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              let chunksProcessed = 0;
              let bytesSent = 0;

              const enqueueTextFromChunk = (chunk: unknown) => {
                const typed = chunk as any;
                const candidates = typed?.candidates?.[0]?.content?.parts || [];

                let text: string | undefined;
                if (typeof typed?.text === "function") {
                  text = typed.text();
                } else if (typed?.text) {
                  text = typed.text;
                } else if (candidates?.[0]?.text) {
                  text = candidates[0].text;
                }

                if (text) {
                  const encoded = encoder.encode(text);
                  bytesSent += encoded.length;
                  controller.enqueue(encoded);
                  chunksProcessed++;
                }
              };

              try {
                const iterator = followUpStream[Symbol.asyncIterator]();
                while (true) {
                  const { value, done } = await iterator.next();
                  if (done) break;
                  enqueueTextFromChunk(value);
                }

                console.log(`Tool response stream completed: ${chunksProcessed} chunks, ${bytesSent} bytes`);
                
                // Background: Update cache with new summary if it was generated
                if (summaryPromise) {
                  summaryPromise.then((newSummary) => {
                    if (newSummary) {
                      console.log("Background: Updating cache with new summary");
                      getConversationCache(ai, conversationHash, newSummary, recentMessages, summaryUpToIndex, providerSchemas)
                        .catch((err) => console.warn("Background cache update failed:", err));
                    }
                  }).catch((err) => console.warn("Background summarization failed:", err));
                }
                
                controller.close();
              } catch (error) {
                console.error("Error streaming tool response:", error);
                controller.error(error);
              }
            }
          }),
          {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          }
        );
      }

      // Otherwise, stream buffered chunks and then the rest as they arrive
      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let chunksProcessed = 0;
            let bytesSent = 0;

            const enqueueTextFromChunk = (chunk: unknown) => {
              const typed = chunk as { text?: string | (() => string); candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
              const candidates = typed.candidates?.[0]?.content?.parts || [];

              let text: string | undefined;
              if (typeof typed.text === "function") {
                text = typed.text();
              } else if (typed.text) {
                text = typed.text;
              } else if (candidates?.[0]?.text) {
                text = candidates[0].text;
              }

              if (text) {
                const encoded = encoder.encode(text);
                bytesSent += encoded.length;
                controller.enqueue(encoded);
                chunksProcessed++;
              }
            };

            try {
              // Flush buffered chunks first
              for (const chunk of bufferedChunks) {
                enqueueTextFromChunk(chunk);
              }

              // Continue streaming remaining chunks
              const iterator = stream[Symbol.asyncIterator]();
              while (true) {
                const { value, done } = await iterator.next();
                if (done) break;
                enqueueTextFromChunk(value);
              }

              console.log(`Stream completed: ${chunksProcessed} chunks, ${bytesSent} bytes`);
              
              // Background: Update cache with new summary if it was generated
              if (summaryPromise) {
                summaryPromise.then((newSummary) => {
                  if (newSummary) {
                    console.log("Background: Updating cache with new summary");
                    getConversationCache(ai, conversationHash, newSummary, recentMessages, summaryUpToIndex, providerSchemas)
                      .catch((err) => console.warn("Background cache update failed:", err));
                  }
                }).catch((err) => console.warn("Background summarization failed:", err));
              }
              
              controller.close();
            } catch (error) {
              console.error("Error streaming response:", error);
              controller.error(error);
            }
          }
        }),
        {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    } catch (error) {
      console.error("Error processing stream:", error);
      // Fallback to non-streaming if stream processing fails
      throw error;
    }

  } catch (error) {
    console.error("Error in chat route:", error);
    return handleServerError(error);
  }
}
