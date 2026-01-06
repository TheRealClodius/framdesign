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
// Key: conversation hash, Value: { cacheName: string, cachedMessageCount: number, createdAt: number }
const conversationCacheStore = new Map<string, { cacheName: string; cachedMessageCount: number; createdAt: number }>();

// Shared system prompt cache (created once, reused)
let systemPromptCache: string | null = null;
let systemPromptCachePromise: Promise<string | null> | null = null;

// Cache TTL: 1 hour (3600 seconds)
const CACHE_TTL_SECONDS = 3600;

// Minimum messages before creating a conversation cache (to ensure we meet token minimums)
const MIN_MESSAGES_FOR_CACHE = 3;

/**
 * Creates a hash of the conversation history to identify unique conversations
 * The hash is stable across messages in the same conversation, only changing
 * when the conversation fundamentally changes (first messages or timeout state)
 */
function hashConversation(messages: Array<{ role: string; content: string }>, timeoutExpired: boolean): string {
  // Create a stable hash based on first few messages and timeout state
  // Note: We don't include messageCount so the hash stays stable as conversation grows
  const key = JSON.stringify({
    firstMessages: messages.slice(0, 3).map(m => ({ role: m.role, content: m.content.substring(0, 100) })),
    timeoutExpired
  });
  
  // Use Node.js crypto module (Next.js API routes run in Node.js runtime by default)
  const hash = createHash('sha256').update(key).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Creates or retrieves the system prompt cache
 */
async function getSystemPromptCache(ai: GoogleGenAI): Promise<string | null> {
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
      const cache = await ai.caches.create({
        model: "gemini-3-flash-preview", // Try with preview model
        config: {
          systemInstruction: FRAM_SYSTEM_PROMPT,
          contents: systemContent,
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
 */
async function getConversationCache(
  ai: GoogleGenAI,
  conversationHash: string,
  history: Array<{ role: string; parts: Array<{ text: string }> }>
): Promise<{ cacheName: string | null; newMessages: Array<{ role: string; parts: Array<{ text: string }> }> }> {
  const cached = conversationCacheStore.get(conversationHash);

  // Check if we have a valid cache
  if (cached) {
    const age = Date.now() - cached.createdAt;
    const ageSeconds = age / 1000;
    
    // If cache is still valid and we have new messages
    if (ageSeconds < CACHE_TTL_SECONDS && cached.cachedMessageCount < history.length) {
      // Return only new messages that aren't cached
      const newMessages = history.slice(cached.cachedMessageCount);
      return { cacheName: cached.cacheName, newMessages };
    } else if (ageSeconds < CACHE_TTL_SECONDS) {
      // Cache is valid and up to date
      return { cacheName: cached.cacheName, newMessages: [] };
    } else {
      // Cache expired, remove it
      conversationCacheStore.delete(conversationHash);
      try {
        if (ai.caches && typeof ai.caches.delete === 'function') {
          await ai.caches.delete({ name: cached.cacheName });
        }
      } catch (error) {
        // Ignore deletion errors (cache may already be expired server-side)
        console.warn("Failed to delete expired cache:", error instanceof Error ? error.message : String(error));
      }
    }
  }

  // Create new cache if we have enough messages
  if (history.length >= MIN_MESSAGES_FOR_CACHE) {
    try {
      // Check if caches API is available
      if (!ai.caches || typeof ai.caches.create !== 'function') {
        console.warn("Cache API not available in this SDK version");
        return { cacheName: null, newMessages: history };
      }

      // Build cache content: system prompt + conversation history
      const cacheContent = [...history];

      const cache = await ai.caches.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: FRAM_SYSTEM_PROMPT,
          contents: cacheContent,
          ttl: `${CACHE_TTL_SECONDS}s`,
          displayName: `fram-conversation-${conversationHash}`
        }
      });

      // Store cache reference
      const cacheName = cache.name || null;
      conversationCacheStore.set(conversationHash, {
        cacheName: cacheName || "",
        cachedMessageCount: history.length,
        createdAt: Date.now()
      });

      console.log(`Conversation cache created: ${cacheName} (${history.length} messages)`);
      return { cacheName, newMessages: [] };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.warn("Failed to create conversation cache:", errorMessage);
      if (errorStack) {
        console.warn("Stack trace:", errorStack);
      }
      // Fall back to non-cached approach
      return { cacheName: null, newMessages: history };
    }
  }

  // Not enough messages yet, return full history
  return { cacheName: null, newMessages: history };
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

    // Build conversation history in Gemini format
    const history: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    // Add system instruction as initial context
    history.push({
      role: "user",
      parts: [{ text: FRAM_SYSTEM_PROMPT }],
    });
    history.push({
      role: "model",
      parts: [{ text: "UNDERSTOOD." }],
    });

    // If a timeout just expired, add context about it BEFORE the conversation history
    // This ensures FRAM understands old offenses are "paid for"
    if (timeoutExpired) {
      history.push({
        role: "user",
        parts: [{ text: "IMPORTANT CONTEXT: A TIMEOUT HAS JUST EXPIRED. THE USER HAS SERVED THEIR TIME FOR PREVIOUS OFFENSES. OLD MESSAGES IN THE CONVERSATION HISTORY THAT LED TO THE TIMEOUT ARE CONSIDERED RESOLVED. ONLY EVALUATE THE USER BASED ON THEIR CURRENT AND RECENT BEHAVIOR AFTER THIS POINT. GIVE THEM A FRESH START UNLESS THEY COMMIT NEW OFFENSES." }],
      });
      history.push({
        role: "model",
        parts: [{ text: "ACKNOWLEDGED. TIMEOUT EXPIRED. EVALUATING ONLY CURRENT BEHAVIOR." }],
      });
    }

    // Convert previous messages to Gemini format
    for (const msg of messages) {
      if (msg.content && msg.content.trim()) {
        history.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Try to use caching for better performance and cost savings
    const conversationHash = hashConversation(messages, timeoutExpired);
    const systemCache = await getSystemPromptCache(ai);
    const { cacheName: conversationCache, newMessages } = await getConversationCache(ai, conversationHash, history);

    // Determine what content to send and whether to use cache
    let contentsToSend: Array<{ role: string; parts: Array<{ text: string }> }>;
    let cachedContent: string | undefined;

    if (conversationCache) {
      // Use conversation cache - only send new messages
      // If no new messages but cache exists, send at least the current user message
      if (newMessages.length > 0) {
        contentsToSend = newMessages;
      } else {
        // Cache is up to date, but we still need to send the current user message
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "user") {
          contentsToSend = [{
            role: "user" as const,
            parts: [{ text: lastMessage.content }],
          }];
        } else {
          // Fallback: send empty array (shouldn't happen in normal flow)
          contentsToSend = [];
        }
      }
      cachedContent = conversationCache;
      console.log(`Using conversation cache: ${conversationCache}, sending ${contentsToSend.length} new messages`);
    } else if (systemCache && history.length < MIN_MESSAGES_FOR_CACHE) {
      // Use system prompt cache only - send full conversation history
      contentsToSend = history;
      cachedContent = systemCache;
      console.log(`Using system prompt cache: ${systemCache}, sending full history (${history.length} messages)`);
    } else {
      // No cache available - send full history
      contentsToSend = history;
      cachedContent = undefined;
      console.log(`No cache available, sending full history (${history.length} messages)`);
    }

    // Generate response with cached content if available (with retry logic)
    const response = await retryWithBackoff(async () => {
      console.log("Calling Gemini API with model: gemini-3-flash-preview");
      console.log("Contents to send:", contentsToSend.length, "messages");
      console.log("Using cached content:", cachedContent || "none");

      const config: {
        tools: Array<{ functionDeclarations: Array<typeof ignoreUserTool> }>;
        cachedContent?: string;
      } = {
        tools: [{ functionDeclarations: [ignoreUserTool] }]
      };

      // Add cached content reference if available
      if (cachedContent) {
        config.cachedContent = cachedContent;
      }

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview", // Gemini 3 Flash Preview
        contents: contentsToSend,
        config
      });
      
      console.log("Gemini API response received");
      console.log("Response structure:", JSON.stringify(Object.keys(result || {})));
      return result;
    });

    // Check if Fram decided to use the ignore_user tool
    const functionCall = response.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    
    if (functionCall && functionCall.name === "ignore_user") {
      const args = functionCall.args as { duration_seconds: number; farewell_message: string };
      const durationSeconds = args.duration_seconds;
      const farewellMessage = args.farewell_message;
      
      console.log("Fram used ignore_user tool:", { durationSeconds, farewellMessage });
      
      return NextResponse.json({
        message: farewellMessage,
        timeout: {
          duration: durationSeconds,
          until: Date.now() + (durationSeconds * 1000)
        }
      });
    }

    // Try to access text property - check different possible structures
    let text: string;
    if (response.text) {
      text = response.text;
    } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
      text = response.candidates[0].content.parts[0].text;
    } else {
      console.error("Unexpected response structure:", JSON.stringify(response, null, 2));
      throw new Error("Unable to extract text from API response");
    }
    
    console.log("Response text length:", text.length);

    return NextResponse.json({
      message: text
    });

  } catch (error) {
    console.error("Error in chat route:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : undefined,
    });
    
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
    
    return NextResponse.json(
      { error: "Internal Server Error", details: errorMessage },
      { status: 500 }
    );
  }
}
