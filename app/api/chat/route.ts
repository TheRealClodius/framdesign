import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { FRAM_SYSTEM_PROMPT } from "@/lib/config";
import { createHash } from "crypto";

// Tool definition for Fram's ignore/timeout capability
const ignoreUserTool = {
  name: "ignore_user",
  description: "Use this when a user is rude, disrespectful, abusive, or crosses a line. This will block the user from sending messages for the specified duration. Use this when words alone are not enough.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      duration_seconds: {
        type: Type.NUMBER,
        description: "How long to ignore the user in seconds. Use 30-60 for mild rudeness, 300-600 for moderate disrespect, 3600 for serious insults, up to 86400 (24 hours) for extreme abuse."
      },
      farewell_message: {
        type: Type.STRING,
        description: "The final message to deliver before going silent. Should be firm and direct, not petty."
      }
    },
    required: ["duration_seconds", "farewell_message"]
  }
};

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

// Cache TTL: 1 hour (3600 seconds)
const CACHE_TTL_SECONDS = 3600;

// Minimum messages before creating a conversation cache (to ensure we meet token minimums)
const MIN_MESSAGES_FOR_CACHE = 3;

// Message windowing: keep last N messages as raw history
const MAX_RAW_MESSAGES = 20;

// Token estimation: rough approximation (1 token ≈ 4 characters)
const TOKENS_PER_CHAR = 0.25;
const MAX_TOKENS = 30000; // Safety limit for context window
const SUMMARY_WORD_LIMIT = 80; // Hard cap for summaries when trimming

// Summarization threshold: summarize when we exceed MAX_RAW_MESSAGES
const SUMMARIZATION_THRESHOLD = MAX_RAW_MESSAGES;

/**
 * Estimates token count for a string (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
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
      .map((msg, idx) => `${msg.role === "user" ? "User" : "Fram"}: ${msg.content}`)
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
    const trimmed = trimToWords(adjustedSummary, SUMMARY_WORD_LIMIT);
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
async function getSystemPromptCache(ai: GoogleGenAI): Promise<string | null> {
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
          tools: [{ functionDeclarations: [ignoreUserTool] }],
          ttl: `${CACHE_TTL_SECONDS}s`,
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
  summaryUpToIndex: number
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
    if (ageSeconds < CACHE_TTL_SECONDS) {
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
          tools: [{ functionDeclarations: [ignoreUserTool] }],
          ttl: `${CACHE_TTL_SECONDS}s`,
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
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
      
      // Check if it's a retryable error (overloaded, rate limit, etc.)
      const isRetryable = 
        errorMessage.includes("overloaded") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("503") ||
        errorMessage.includes("429");
      
      if (!isRetryable || attempt === maxRetries - 1) {
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

    if (totalMessages > MAX_RAW_MESSAGES) {
      // Split: old messages to summarize, recent messages to keep raw
      const splitIndex = totalMessages - MAX_RAW_MESSAGES;
      messagesToSummarize = messages.slice(0, splitIndex);
      rawMessages = messages.slice(splitIndex);
      summaryUpToIndex = splitIndex;

      // Check if we need to generate/update summary
      const needsNewSummary = !cached || !cached.summary || cached.summaryUpToIndex < splitIndex;

      if (needsNewSummary) {
        console.log(`Summarizing ${messagesToSummarize.length} old messages (keeping last ${MAX_RAW_MESSAGES} raw)`);
        summary = await summarizeMessages(ai, messagesToSummarize);
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
    let contentsToSend: Array<{ role: string; parts: Array<{ text: string }> }>;
    let cachedContent: string | undefined;

    if (ENABLE_CACHING) {
      try {
        // Get system prompt cache (layer 1)
        const systemCache = await getSystemPromptCache(ai);
        
        // Get conversation cache with summary (layer 2) and recent messages (layer 3)
        const { cacheName: summaryCacheName, contentsToSend: cachedContents, summary: cachedSummary } = 
          await getConversationCache(ai, conversationHash, summary, recentMessages, summaryUpToIndex);

        // Determine what content to send and which cache to use
        if (summaryCacheName && cachedSummary) {
          // Use summary cache - send recent messages only
          contentsToSend = cachedContents;
          cachedContent = summaryCacheName;
          console.log(`Using summary cache: ${summaryCacheName}, sending ${contentsToSend.length} recent messages`);
          console.log(`Context: ${cachedSummary.length} chars summary + ${recentMessages.length} recent messages`);
        } else if (systemCache && !summary) {
          // Use system prompt cache only - send recent messages
          contentsToSend = recentMessages;
          cachedContent = systemCache;
          console.log(`Using system prompt cache: ${systemCache}, sending ${contentsToSend.length} recent messages`);
        } else {
          // No cache available - send summary context + recent messages
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
          console.log(`No summary cache available, sending ${contentsToSend.length} messages (${summary ? 'with summary' : 'no summary'})`);
        }

        // Log token estimates
        const estimatedTokens = estimateMessageTokens(contentsToSend);
        console.log(`Estimated tokens: ~${estimatedTokens} (limit: ${MAX_TOKENS})`);
        if (estimatedTokens > MAX_TOKENS) {
          console.warn(`WARNING: Estimated tokens (${estimatedTokens}) exceed safety limit (${MAX_TOKENS})`);
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
    const budgetResult = enforceTokenBudget(contentsToSend, summary, MAX_TOKENS);
    contentsToSend = budgetResult.contents;
    summary = budgetResult.summary;
    if (budgetResult.summaryTrimmed) {
      console.log(`Summary trimmed to ${SUMMARY_WORD_LIMIT} words for token budget`);
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
        tools?: Array<{ functionDeclarations: Array<typeof ignoreUserTool> }>;
        cachedContent?: string;
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
        config.tools = [{ functionDeclarations: [ignoreUserTool] }];
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

    // Check for function calls across the full stream before sending output
    let functionCall: { name: string; args: { duration_seconds: number; farewell_message: string } } | null = null;
    const textChunks: string[] = [];

    try {
      for await (const chunk of stream as AsyncIterable<unknown>) {
        const typed = chunk as { text?: string | (() => string); candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: { duration_seconds: number; farewell_message: string } } }> } }> };
        const candidates = typed.candidates?.[0]?.content?.parts || [];

        // Detect function call anywhere in the stream
        const callPart = candidates.find((part) => part.functionCall);
        if (callPart?.functionCall) {
          functionCall = callPart.functionCall;
          break;
        }

        let text: string | undefined;
        if (typeof typed.text === "function") {
          text = typed.text();
        } else if (typed.text) {
          text = typed.text;
        } else if (candidates?.[0]?.text) {
          text = candidates[0].text;
        }

        if (text) {
          textChunks.push(text);
        }
      }

      // If function call detected, handle it and return JSON
      if (functionCall?.name === "ignore_user") {
        const args = functionCall.args as { duration_seconds: number; farewell_message: string };
        const durationSeconds = args.duration_seconds;
        const farewellMessage = args.farewell_message;

        console.log("Fram used ignore_user tool:", { durationSeconds, farewellMessage });

        return NextResponse.json({
          message: farewellMessage,
          timeout: {
            duration: durationSeconds,
            until: Date.now() + durationSeconds * 1000
          }
        });
      }

      // No tool call: stream buffered text chunks to the client
      return new Response(
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            let chunksProcessed = 0;
            let bytesSent = 0;

            try {
              for (const text of textChunks) {
                const encoded = encoder.encode(text);
                bytesSent += encoded.length;
                controller.enqueue(encoded);
                chunksProcessed++;
              }
              console.log(`Stream completed: ${chunksProcessed} chunks, ${bytesSent} bytes`);
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : undefined,
      error: String(error)
    });
    
    // Ensure we always return a valid JSON response
    try {
      // Check if it's an overloaded error
      if (errorMessage.toLowerCase().includes("overloaded")) {
        return NextResponse.json(
          { error: "The AI model is currently overloaded. Please try again in a moment." },
          { status: 503 }
        );
      }
      
      // Check for API key errors
      if (errorMessage.toLowerCase().includes("api key") || errorMessage.toLowerCase().includes("authentication") || errorMessage.toLowerCase().includes("401") || errorMessage.toLowerCase().includes("403")) {
        return NextResponse.json(
          { error: "Invalid API key. Please check your GEMINI_API_KEY environment variable.", details: errorMessage },
          { status: 401 }
        );
      }
      
      // Return error with details
      return NextResponse.json(
        { error: "Internal Server Error", details: errorMessage },
        { status: 500 }
      );
    } catch (jsonError) {
      // If JSON serialization fails, return a simple error
      console.error("Failed to serialize error response:", jsonError);
      return new NextResponse(
        JSON.stringify({ error: "Internal Server Error", details: "An unexpected error occurred" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
}
