import { NextResponse } from "next/server";

// Configure proxy for Node.js native fetch (required in containerized environments)
if (process.env.HTTPS_PROXY) {
  try {
    const { setGlobalDispatcher, ProxyAgent } = require('undici');
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
  } catch (e) {
    console.warn('Failed to configure proxy:', e);
  }
}

import { GoogleGenAI, type Content, type Part, type FunctionCall, type FunctionResponse } from "@google/genai";
import { FRAM_SYSTEM_PROMPT } from "@/lib/config";
import { createHash } from "crypto";
import { handleServerError, isRetryableError, isCacheError } from "@/lib/errors";
import fs from 'fs';
import path from 'path';

function debugLog(msg: string) {
  try {
    fs.appendFileSync(path.join(process.cwd(), 'debug.log'), new Date().toISOString() + ' ' + msg + '\n');
  } catch (e) {
    // ignore
  }
}
import {
  CACHE_CONFIG,
  MESSAGE_LIMITS,
  TOKEN_CONFIG,
  STREAM_CONFIG,
} from "@/lib/constants";
import { estimateTokens, estimateMessageTokens, countTokens } from "@/lib/token-count";
import { toolRegistry } from '@/tools/_core/registry';
import { createStateController } from '@/tools/_core/state-controller';
import { retryWithBackoff as retryToolExecution } from '@/tools/_core/retry-handler';
import { UsageService } from '@/lib/services/usage-service';
import { toolMemoryStore } from '@/tools/_core/tool-memory-store';
import { loopDetector } from '@/tools/_core/loop-detector';
import { toolMemoryDedup } from '@/tools/_core/tool-memory-dedup';
import { toolMemorySummarizer } from '@/tools/_core/tool-memory-summarizer';
import { hashArgs } from '@/tools/_core/utils/hash-args';
import { estimateTokens as estimateTokensForJson } from '@/tools/_core/utils/estimate-tokens';

// Type definitions
type ProviderSchema = {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
};

type GeminiConfig = {
  tools?: Array<{ functionDeclarations: ProviderSchema[] }>;
  cachedContent?: string;
  systemInstruction?: string;
};

type ContentPart = Part;
type ContentMessage = {
  role: string;
  parts: Part[];
};

type FunctionCallPart = {
  functionCall: FunctionCall;
  thoughtSignature?: string; // Must be sibling of functionCall, not inside it
};

type RawMessage = {
  role: string;
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; result: unknown }>;
};

type ObservabilityContextStack = {
  systemPromptSource: string;
  totalMessages: number;
  recentMessages: number;
  summaryPresent: boolean;
  summaryUpToIndex: number;
  cachedContentUsed: boolean;
  cachedTokens?: number;
  estimatedTokens: number;
  timeoutExpired: boolean;
};

type ObservabilityToolCall = {
  position: number;
  chainPosition: number;
  toolId: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
  startTime: number;
  duration: number;
  ok: boolean;
  result: unknown;
  error: unknown;
};

type StateController = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  applyIntent?: (intent: unknown) => void;
  getSnapshot: () => Record<string, unknown>;
};

type ToolMetadata = {
  version?: string;
  category?: string;
  [key: string]: unknown;
};

type ObservabilityData = {
  contextStack: ObservabilityContextStack;
  toolCalls: ObservabilityToolCall[];
  chainedCalls: number;
  totalDuration: number;
  finalResponseLength: number;
  requestStartTime: number;
};

type StreamChunkPart = {
  text?: string;
  functionCall?: FunctionCall;
  thoughtSignature?: string; // Note: SDK returns thoughtSignature as sibling of functionCall
};

type StreamChunkContent = {
  parts?: StreamChunkPart[];
};

type StreamChunkCandidate = {
  content?: StreamChunkContent;
};

type StreamChunk = {
  candidates?: StreamChunkCandidate[];
  text?: string | (() => string);
};

const VISUAL_ASSET_TYPES = new Set(["photo", "diagram", "gif", "video"]);

function getLastUserMessageText(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user" && typeof messages[i]?.content === "string") {
      return messages[i].content;
    }
  }
  return "";
}

function isVisualShowRequest(text: string): boolean {
  const normalized = (text || "").toLowerCase();
  if (!normalized) return false;
  const hasVisualNoun = /\b(photo|image|picture|screenshot|diagram|video|gif)\b/.test(normalized);
  const hasShowVerb = /\b(show|see|display|view|look)\b/.test(normalized);
  return hasVisualNoun || (hasShowVerb && normalized.includes("me"));
}

function selectTopVisualResultId(results: Array<{ id?: string; type?: string; metadata?: { entity_type?: string } }> = []): string | null {
  for (const result of results) {
    const type = result?.type || result?.metadata?.entity_type;
    if (type && VISUAL_ASSET_TYPES.has(type) && typeof result?.id === "string") {
      return result.id;
    }
  }
  return null;
}

// Schema conversion removed - using canonical JSON Schema directly from registry

// In-memory cache store for conversation caches
// Key: conversation hash, Value: { cacheName: string, cachedMessageCount: number, summary: string | null, summaryUpToIndex: number, createdAt: number }
const conversationCacheStore = new Map<string, { 
  cacheName: string; 
  cachedMessageCount: number; 
  summary: string | null;
  summaryUpToIndex: number;
  createdAt: number 
}>();

// In-memory store for tool call/result events per conversation
// Key: conversation hash, Value: { lastAccess: number, eventsByTurn: Map<turnNumber, ToolEvent[]> }
type ToolEvent = {
  type: 'call' | 'result';
  toolName: string;
  args?: Record<string, unknown>;
  thoughtSignature?: string;
  result?: Record<string, unknown> | { error: boolean; type: string; message: string; retryable: boolean; details?: unknown };
  chainPosition: number;
};
const toolSessionStore = new Map<string, {
  lastAccess: number;
  eventsByTurn: Map<number, ToolEvent[]>;
}>();

// TTL for tool session store: 60 minutes idle
const TOOL_SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * Clean up expired tool session entries
 */
function cleanupToolSessions(): void {
  const now = Date.now();
  for (const [hash, session] of toolSessionStore.entries()) {
    if (now - session.lastAccess > TOOL_SESSION_TTL_MS) {
      toolSessionStore.delete(hash);
      console.log(`[ToolSession] Cleaned up expired session: ${hash}`);
    }
  }
}

/**
 * Get or create tool session for a conversation hash
 */
function getOrCreateToolSession(conversationHash: string): { lastAccess: number; eventsByTurn: Map<number, ToolEvent[]> } {
  cleanupToolSessions(); // Clean up on access
  
  if (!toolSessionStore.has(conversationHash)) {
    toolSessionStore.set(conversationHash, {
      lastAccess: Date.now(),
      eventsByTurn: new Map()
    });
  }
  
  const session = toolSessionStore.get(conversationHash)!;
  session.lastAccess = Date.now();
  return session;
}

/**
 * Record a tool call event
 */
function recordToolCall(
  conversationHash: string,
  turnNumber: number,
  toolName: string,
  args: Record<string, unknown>,
  thoughtSignature?: string,
  chainPosition: number = 0
): void {
  const session = getOrCreateToolSession(conversationHash);
  if (!session.eventsByTurn.has(turnNumber)) {
    session.eventsByTurn.set(turnNumber, []);
  }
  
  const events = session.eventsByTurn.get(turnNumber)!;
  events.push({
    type: 'call',
    toolName,
    args,
    thoughtSignature,
    chainPosition
  });
  
  console.log(`[ToolSession] Recorded tool call: ${toolName} (turn ${turnNumber}, chain ${chainPosition})`);
}

/**
 * Record a tool result event
 */
function recordToolResult(
  conversationHash: string,
  turnNumber: number,
  toolName: string,
  result: Record<string, unknown> | { error: boolean; type: string; message: string; retryable: boolean; details?: unknown },
  chainPosition: number = 0
): void {
  const session = getOrCreateToolSession(conversationHash);
  if (!session.eventsByTurn.has(turnNumber)) {
    session.eventsByTurn.set(turnNumber, []);
  }
  
  const events = session.eventsByTurn.get(turnNumber)!;
  events.push({
    type: 'result',
    toolName,
    result,
    chainPosition
  });
  
  console.log(`[ToolSession] Recorded tool result: ${toolName} (turn ${turnNumber}, chain ${chainPosition})`);
}

// Shared system prompt cache (created once, reused)
let systemPromptCache: string | null = null;
let systemPromptCachePromise: Promise<string | null> | null = null;
let systemPromptHash: string | null = null; // Hash of the system prompt to detect changes

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
      model: "gemini-2.5-flash",
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
 * Checks if KB search results are relevant to the query
 * Returns true if results appear relevant, false if they're clearly irrelevant
 */
function areKbResultsRelevant(
  query: string,
  results: Array<{ score?: number; title?: string; snippet?: string; id?: string }>
): boolean {
  if (!results || results.length === 0) {
    return false;
  }

  // Extract query terms (lowercase, simple words)
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
  if (queryTerms.length === 0) {
    return true; // Can't determine, assume relevant
  }

  // Check if any result has a high enough score and matches query terms
  const RELEVANCE_THRESHOLD = 0.4; // Scores below this are likely irrelevant
  const hasRelevantScore = results.some(r => (r.score || 0) >= RELEVANCE_THRESHOLD);
  
  // Check if query terms appear in titles or snippets
  const hasQueryMatch = results.some(result => {
    const title = (result.title || '').toLowerCase();
    const snippet = (result.snippet || '').toLowerCase();
    const id = (result.id || '').toLowerCase();
    const combined = `${title} ${snippet} ${id}`;
    
    // Check if any query term appears in the result
    return queryTerms.some(term => combined.includes(term));
  });

  // Results are relevant if they have good scores OR match query terms
  return hasRelevantScore || hasQueryMatch;
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
 * Strips suggestion markup from message content before sending to Gemini API.
 * This handles cases where the client sends messages with unstripped suggestions
 * due to React's asynchronous state updates.
 */
function stripSuggestionsFromContent(content: string): string {
  if (!content) return content;

  let result = content;

  // Remove inline suggestions: <suggestions>[...]</suggestions>
  result = result.replace(/<suggestions>[\s\S]*?<\/suggestions>/g, '').trimEnd();

  // Remove legacy ---SUGGESTIONS--- markers and their JSON payloads
  const suggestionsMarker = '---SUGGESTIONS---';
  if (result.includes(suggestionsMarker)) {
    result = result.substring(0, result.indexOf(suggestionsMarker)).trimEnd();
  }

  return result;
}

/**
 * Builds a user-friendly status message for tool execution
 * @param toolId - Tool identifier
 * @param args - Tool arguments
 * @returns Status message string
 */
function buildToolStatus(toolId: string, args: Record<string, unknown>): string {
  // Extract summary from args based on tool type
  let summary = "";
  
  if (toolId === "perplexity_search") {
    summary = (args.query as string) || "";
  } else if (toolId === "kb_search") {
    summary = (args.query as string) || "";
  } else if (toolId === "kb_get") {
    summary = (args.id as string) || "";
  } else {
    // Fallback: create a compact summary from args
    const argKeys = Object.keys(args);
    if (argKeys.length > 0) {
      const firstKey = argKeys[0];
      const firstValue = args[firstKey];
      if (typeof firstValue === "string" && firstValue.length > 0) {
        summary = firstValue.length > 30 ? firstValue.substring(0, 30) + "..." : firstValue;
      } else {
        summary = JSON.stringify(args).substring(0, 30);
      }
    }
  }
  
  // Map tool IDs to status messages
  const statusMap: Record<string, string> = {
    perplexity_search: `Searching the web for ${summary}`,
    kb_search: `Looking more into ${summary}`,
    kb_get: `Fetching details for ${summary}`
  };
  
  return statusMap[toolId] || `Using ${toolId}...`;
}

/**
 * Encodes a status event into the stream format
 * @param status - Status message string
 * @returns Encoded status event string
 */
function encodeStatusEvent(status: string): string {
  return `\n---STATUS---\n${JSON.stringify({ status })}\n---ENDSTATUS---\n`;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

/**
 * Enforce token budget by trimming summary and dropping oldest context items.
 */
function enforceTokenBudget(
  contents: ContentMessage[],
  summary: string | null,
  maxTokens: number
): {
  contents: ContentMessage[];
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
async function getSystemPromptCache(ai: GoogleGenAI, providerSchemas: ProviderSchema[]): Promise<string | null> {
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
      // Note: this model might not support caching yet
      // We'll try to create cache, but fall back gracefully if it fails
      // Include tools in cache so we don't need to pass them when using cached content
      const cache = await ai.caches.create({
        model: "gemini-2.5-flash",
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
  recentMessages: ContentMessage[],
  summaryUpToIndex: number,
  providerSchemas: ProviderSchema[]
): Promise<{ 
  cacheName: string | null; 
  summaryCacheName: string | null;
  contentsToSend: ContentMessage[];
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
        const contentsToSend: ContentMessage[] = [
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
        model: "gemini-2.5-flash",
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
      const contentsToSend: ContentMessage[] = [
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
  // T0: Request received
  const requestStartTime = Date.now();

  // Check for observability mode (dev-only)
  const url = new URL(request.url);
  const observabilityMode = url.searchParams.get('_observability') === 'true';

  // Initialize observability collector (only if mode is enabled)
  const observability: ObservabilityData | null = observabilityMode ? {
    contextStack: {} as ObservabilityContextStack,
    toolCalls: [] as ObservabilityToolCall[],
    chainedCalls: 0,
    totalDuration: 0,
    finalResponseLength: 0,
    requestStartTime: requestStartTime
  } : null;

  try {
    const body = await request.json();
    const { messages, timeoutExpired, userId } = body;

    // Check global budget if userId is provided
    // Wrapped in try/catch to prevent chat failures when usage store is inaccessible
    if (userId) {
      try {
        const isOverBudget = await UsageService.isOverBudget(userId);
        if (isOverBudget) {
          return NextResponse.json({
            error: "USER_BUDGET_EXHAUSTED",
            message: "You have reached your global token limit. Please contact support to increase your budget."
          }, { status: 402 });
        }
      } catch (budgetError) {
        console.error("Failed to check user budget, allowing request to proceed:", budgetError);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // Log for debugging (API key presence, not the key itself)
    console.log("GEMINI_API_KEY present:", !!apiKey);
    console.log("GEMINI_API_KEY length:", apiKey ? apiKey.length : 0);

    // Ensure the tool memory summarizer is initialized with the API key
    if (apiKey) {
      toolMemorySummarizer.reinitialize();
    }

    if (!apiKey) {
      // Return a mock response if no API key is configured
      console.error("GEMINI_API_KEY is missing!");
      const response = {
        message: "I AM A DEMO AI ASSISTANT. PLEASE CONFIGURE THE GEMINI_API_KEY ENVIRONMENT VARIABLE TO ENABLE REAL RESPONSES."
      };
      
      // Append observability if enabled (with minimal context stack)
      if (observability) {
        observability.contextStack = {
          systemPromptSource: "N/A (no API key)",
          totalMessages: 0,
          recentMessages: 0,
          summaryPresent: false,
          summaryUpToIndex: 0,
          cachedContentUsed: false,
          estimatedTokens: 0,
          timeoutExpired: false
        };
        observability.totalDuration = Date.now() - observability.requestStartTime;
        (response as { observability?: ObservabilityData }).observability = {
          contextStack: observability.contextStack,
          toolCalls: [],
          chainedCalls: 0,
          totalDuration: observability.totalDuration,
          finalResponseLength: JSON.stringify(response).length,
          requestStartTime: observability.requestStartTime
        };
      }
      
      return NextResponse.json(response);
    }

    if (!messages || messages.length === 0) {
      const errorResponse = {
        error: "No messages provided"
      };
      
      // Append observability if enabled
      if (observability) {
        observability.contextStack = {
          systemPromptSource: "N/A (no messages)",
          totalMessages: 0,
          recentMessages: 0,
          summaryPresent: false,
          summaryUpToIndex: 0,
          cachedContentUsed: false,
          estimatedTokens: 0,
          timeoutExpired: false
        };
        observability.totalDuration = Date.now() - observability.requestStartTime;
        (errorResponse as { observability?: ObservabilityData }).observability = {
          contextStack: observability.contextStack,
          toolCalls: [],
          chainedCalls: 0,
          totalDuration: observability.totalDuration,
          finalResponseLength: JSON.stringify(errorResponse).length,
          requestStartTime: observability.requestStartTime
        };
      }
      
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const lastUserMessageText = getLastUserMessageText(messages);

    const ai = new GoogleGenAI({ apiKey });

    // Load registry if not already loaded
    if (!toolRegistry.getVersion()) {
      try {
        await toolRegistry.load();
        toolRegistry.lock();
        console.log(`✓ Tool registry loaded: v${toolRegistry.getVersion()}`);
      } catch (error) {
        console.error('Failed to load tool registry:', error);
        const errorResponse = {
          error: 'Tool registry initialization failed',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: 'The tool registry file is missing or invalid. This should be generated during build.'
        };
        
        // Append observability if enabled
        if (observability) {
          observability.contextStack = {
            systemPromptSource: "N/A (registry failed)",
            totalMessages: messages?.length || 0,
            recentMessages: 0,
            summaryPresent: false,
            summaryUpToIndex: 0,
            cachedContentUsed: false,
            estimatedTokens: 0,
            timeoutExpired: false
          };
          observability.totalDuration = Date.now() - observability.requestStartTime;
          (errorResponse as { observability?: ObservabilityData }).observability = {
            contextStack: observability.contextStack,
            toolCalls: [],
            chainedCalls: 0,
            totalDuration: observability.totalDuration,
            finalResponseLength: JSON.stringify(errorResponse).length,
            requestStartTime: observability.requestStartTime
          };
        }
        
        return NextResponse.json(errorResponse, { status: 500 });
      }
    }

    // Get provider schemas for Gemini 3
    // Use canonical JSON Schema directly from registry (no conversion needed)
    const providerSchemas = Array.from(toolRegistry.tools.values()).map(tool => ({
      name: tool.toolId,
      description: tool.description,
      parametersJsonSchema: tool.jsonSchema  // Canonical JSON Schema from registry
    }));

    // Caching enabled for performance and cost savings
    const ENABLE_CACHING = true;

    // Get conversation hash for cache tracking
    const conversationHash = hashConversation(messages, timeoutExpired);
    const cached = conversationCacheStore.get(conversationHash);

    // Implement message windowing: keep last MAX_RAW_MESSAGES messages
    const totalMessages = messages.length;
    let rawMessages: RawMessage[];
    let messagesToSummarize: RawMessage[] = [];
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
    const recentMessages: ContentMessage[] = [];

    // Inject Tool Memory Summary (Point B/C from tool-memory.md)
    // This ensures the agent is always aware of its "vision status" before answering
    const sessionId = userId || 'anonymous-text-session';
    const pastToolCalls = toolMemoryStore.queryToolCalls(sessionId, { toolId: "", timeRange: 'all', includeErrors: false });
    
    if (pastToolCalls.length > 0) {
      const summaryLines = pastToolCalls.map(call => 
        `- ID: ${call.id} | Tool: ${call.toolId} | Turn: ${call.turn || '?'}${call.summary ? ` | Summary: ${call.summary}` : ''}`
      ).reverse(); // Oldest first

      const toolMemoryContext = `SESSION TOOL HISTORY:\n${summaryLines.join('\n')}\n\nUse 'query_tool_memory' with a specific ID to retrieve the full response if needed.`;
      
      recentMessages.push({
        role: "user",
        parts: [{ text: `[SYSTEM CONTEXT: ${toolMemoryContext}]` }],
      });
      recentMessages.push({
        role: "model",
        parts: [{ text: "ACKNOWLEDGED. I have the history of tool executions for this session." }],
      });
    }

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

    // Convert recent raw messages to Gemini format with structured tool parts
    // Track turn numbers to inject stored tool events
    const session = getOrCreateToolSession(conversationHash);
    
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      
      // Calculate turn number based on position in full conversation
      // rawMessages[i] corresponds to messages[summaryUpToIndex + i]
      // Turn number = Math.ceil((summaryUpToIndex + i + 1) / 2)
      const messageIndexInFullConversation = summaryUpToIndex + i;
      const currentTurnNumber = Math.ceil((messageIndexInFullConversation + 1) / 2);
      
      const parts: ContentPart[] = [];
      
      // Add text content if present
      let content = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
      if (msg.role === 'assistant') {
        content = stripSuggestionsFromContent(content);
      }
      if (content.trim()) {
        parts.push({ text: content });
      }
      
      // Add structured tool calls if present (for assistant/model messages)
      if (msg.role === 'assistant' && msg.toolCalls && Array.isArray(msg.toolCalls)) {
        msg.toolCalls.forEach((call: any) => {
          if (call.name && call.args) {
            parts.push({
              functionCall: {
                name: call.name,
                args: toRecord(call.args)
              }
            });
          }
        });
      }
      
      // Add structured tool results if present (for user messages after tool execution)
      if (msg.role === 'user' && msg.toolResults && Array.isArray(msg.toolResults)) {
        msg.toolResults.forEach((result: any) => {
          if (result.name && result.result !== undefined) {
            parts.push({
              functionResponse: {
                name: result.name,
                response: toRecord(result.result)
              }
            });
          }
        });
      }
      
      // Only add message if it has content
      if (parts.length > 0) {
        recentMessages.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts
        });
      }
      
      // After processing a user message, inject stored tool events for this turn
      // Skip if message already has toolResults (client sent them)
      if (msg.role === 'user' && (!msg.toolResults || !Array.isArray(msg.toolResults) || msg.toolResults.length === 0)) {
        const turnEvents = session.eventsByTurn.get(currentTurnNumber);
        if (turnEvents && turnEvents.length > 0) {
          // Sort events by chainPosition to maintain order
          const sortedEvents = [...turnEvents].sort((a, b) => a.chainPosition - b.chainPosition);
          
          // Group events by chain position to create proper call/result pairs
          const chainGroups = new Map<number, { call?: ToolEvent; result?: ToolEvent }>();
          for (const event of sortedEvents) {
            if (!chainGroups.has(event.chainPosition)) {
              chainGroups.set(event.chainPosition, {});
            }
            const group = chainGroups.get(event.chainPosition)!;
            if (event.type === 'call') {
              group.call = event;
            } else if (event.type === 'result') {
              group.result = event;
            }
          }
          
          // Inject tool call/result pairs in order
          for (const chainPos of Array.from(chainGroups.keys()).sort((a, b) => a - b)) {
            const group = chainGroups.get(chainPos)!;
            
            // Add functionCall message (model role)
            if (group.call) {
              const callParts: ContentPart[] = [];
              callParts.push({
                functionCall: {
                  name: group.call.toolName,
                  args: toRecord(group.call.args || {})
                }
              });
              recentMessages.push({
                role: "model",
                parts: callParts
              });
              console.log(`[ToolSession] Injected stored tool call: ${group.call.toolName} (turn ${currentTurnNumber}, chain ${chainPos})`);
            }
            
            // Add functionResponse message (user role)
            if (group.result) {
              const resultParts: ContentPart[] = [];
              resultParts.push({
                functionResponse: {
                  name: group.result.toolName,
                  response: toRecord(group.result.result)
                }
              });
              recentMessages.push({
                role: "user",
                parts: resultParts
              });
              console.log(`[ToolSession] Injected stored tool result: ${group.result.toolName} (turn ${currentTurnNumber}, chain ${chainPos})`);
            }
          }
        }
      }
    }

    // Try to use caching for better performance and cost savings
    // OPTIMIZATION: Use fast path with existing cache, update in background
    let contentsToSend: ContentMessage[];
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
              console.log(`✓ Cache HIT: Using existing summary cache (age: ${ageSeconds.toFixed(1)}s)`);
            } else {
              // Get system cache (no timeout - wait for completion)
              const systemCache = await getSystemPromptCache(ai, providerSchemas);
              contentsToSend = recentMessages;
              cachedContent = systemCache || undefined;
              if (systemCache) {
                console.log(`✓ Cache HIT: Using system cache (no summary yet)`);
              } else {
                console.log(`⚠️  Cache MISS: System cache creation failed, proceeding without cache`);
              }
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
          // No existing cache, create one (no timeout - wait for completion)
          console.log("No existing cache, initializing...");
          const cacheStartTime = Date.now();

          // Get system prompt cache without timeout
          const systemCache = await getSystemPromptCache(ai, providerSchemas);
          const cacheDuration = Date.now() - cacheStartTime;

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

          if (systemCache) {
            console.log(`✓ Cache CREATED: System cache initialized in ${cacheDuration}ms`);
          } else {
            console.log(`⚠️  Cache MISS: System cache creation failed after ${cacheDuration}ms, proceeding without cache`);
          }
          console.log(`Initialized cache, sending ${contentsToSend.length} messages`);

          // Background: Create conversation cache for next time (don't await)
          if (summary) {
            getConversationCache(ai, conversationHash, summary, recentMessages, summaryUpToIndex, providerSchemas)
              .catch((err) => console.warn("Background cache creation failed:", err));
          }
        }

        // Log token estimates with cache stats
        const estimatedTokens = estimateMessageTokens(contentsToSend);
        let cachedTokens = 0;
        if (cachedContent) {
          // System prompt tokens
          cachedTokens += estimateTokens(FRAM_SYSTEM_PROMPT);
          // Tool schemas are also cached - estimate based on JSON size
          const toolSchemasJson = JSON.stringify(providerSchemas);
          cachedTokens += estimateTokens(toolSchemasJson);
        }

        console.log(`Token usage: ${estimatedTokens} request tokens${cachedContent ? ` + ${cachedTokens} cached tokens (${(cachedTokens / (estimatedTokens + cachedTokens) * 100).toFixed(1)}% cached)` : ' + 0 cached tokens (cache disabled/failed)'}`);
        console.log(`Total context: ~${estimatedTokens + cachedTokens} tokens (limit: ${TOKEN_CONFIG.MAX_TOKENS})`);

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

    // T1: Context preparation complete
    const contextPrepTime = Date.now();
    console.log(`[Request Lifecycle] Context prep: ${contextPrepTime - requestStartTime}ms (T1-T0)`);

    // Phase 2: Context Size Analysis
    const contextMetrics = {
      messageCount: contentsToSend.length,
      totalChars: contentsToSend.reduce((sum, msg) => sum + JSON.stringify(msg).length, 0),
      estimatedTokens: estimateMessageTokens(contentsToSend),
      hasSummary: !!summary,
      summaryTokens: summary ? estimateTokens(summary) : 0,
      toolSchemaTokens: estimateTokens(JSON.stringify(providerSchemas))
    };
    console.log('[Context Analysis]', JSON.stringify(contextMetrics, null, 2));

    // Collect context stack data for observability
    if (observability) {
      const toolCount = toolRegistry.tools.size;
      const estimatedTokens = estimateMessageTokens(contentsToSend);
      
      // Calculate cached tokens (system prompt + tool schemas when caching is active)
      let cachedTokens = 0;
      if (cachedContent) {
        // System prompt tokens
        cachedTokens += estimateTokens(FRAM_SYSTEM_PROMPT);
        // Tool schemas are also cached - estimate based on JSON size
        const toolSchemasJson = JSON.stringify(providerSchemas);
        cachedTokens += estimateTokens(toolSchemasJson);
      }
      
      observability.contextStack = {
        systemPromptSource: `core.md + ${toolCount} tools`,
        totalMessages: totalMessages,
        recentMessages: recentMessages.length,
        summaryPresent: !!summary,
        summaryUpToIndex: summaryUpToIndex,
        cachedContentUsed: !!cachedContent,
        cachedTokens: cachedTokens,
        estimatedTokens: estimatedTokens,
        timeoutExpired: timeoutExpired || false
      };
    }

    // T2: About to call Gemini API
    const geminiCallStart = Date.now();
    console.log(`[Request Lifecycle] Pre-Gemini: ${geminiCallStart - contextPrepTime}ms (T2-T1)`);

    // Generate response with streaming (with retry logic)
    const stream = await retryWithBackoff(async () => {
      const estimatedTokens = estimateMessageTokens(contentsToSend);
      console.log("=== Gemini API Request ===");
      console.log("Model: gemini-2.5-flash (streaming)");
      console.log("Messages to send:", contentsToSend.length);
      console.log("Estimated tokens:", estimatedTokens);
      console.log("Using cached content:", cachedContent || "none");
      console.log("Tools available:", providerSchemas.length);
      console.log("Summary present:", summary ? `Yes (${summary.length} chars)` : "No");
      console.log("Recent messages:", recentMessages.length);
      if (summary) {
        console.log(`Context breakdown: Summary (~${estimateTokens(summary)} tokens) + ${recentMessages.length} recent messages (~${estimateMessageTokens(recentMessages)} tokens)`);
      }

      // When using cached content, tools must be included in the cache, not in the request
      // So we conditionally include tools based on whether we're using cached content
      const config: GeminiConfig = {};

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

      try {
        const apiCallStart = Date.now();
        const result = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: contentsToSend,
          config
        });
        const streamCreated = Date.now();
        console.log(`[Gemini API] Stream created in ${streamCreated - apiCallStart}ms`);

        return result;
      } catch (err) {
        // If cache error and we're using cache, retry without cache
        if (isCacheError(err) && usingCache) {
          console.warn(`Cache error detected in initial stream, retrying without cache`);
          debugLog(`Retrying initial stream without cache`);
          
          // Retry without cache
          const fallbackConfig: GeminiConfig = {
            tools: [{ functionDeclarations: providerSchemas }],
            systemInstruction: FRAM_SYSTEM_PROMPT
          };
          
          const result = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: contentsToSend,
            config: fallbackConfig
          });
          
          console.log("Gemini API stream created (fallback without cache)");
          return result;
        }
        
        throw err;
      }
    });

    // Check early chunks for function calls, then stream progressively to the client
    // Store the functionCall data (name and args)
    const functionCalls: FunctionCall[] = [];
    // Store the full functionCallParts with thoughtSignature as sibling (required by Gemini 3)
    const functionCallParts: FunctionCallPart[] = [];
    const bufferedChunks: unknown[] = [];

    try {
      const iterator = stream[Symbol.asyncIterator]();
      const bufferStart = Date.now();
      let firstChunkTime: number | null = null;

      // Buffer a few chunks (or up to time limit) to detect function calls before streaming
      while (bufferedChunks.length < STREAM_CONFIG.MAX_BUFFER_CHUNKS && Date.now() - bufferStart < STREAM_CONFIG.MAX_BUFFER_MS) {
        const { value, done } = await iterator.next();
        if (done) break;

        // T3: First chunk received from Gemini
        if (firstChunkTime === null) {
          firstChunkTime = Date.now();
          console.log(`[Request Lifecycle] Gemini TTFT: ${firstChunkTime - geminiCallStart}ms (T3-T2) ← KEY METRIC`);
          console.log(`[Gemini API] Time from stream created to first chunk: ${firstChunkTime - bufferStart}ms (model processing)`);
        }

        bufferedChunks.push(value);

        const typed = value as { 
          candidates?: Array<{ 
            content?: { parts?: Array<StreamChunkPart> },
            finishReason?: string,
            safetyRatings?: Array<{ category: string, probability: string }>
          }>,
          usageMetadata?: any,
          promptFeedback?: any
        };
        
        const candidates = typed.candidates?.[0]?.content?.parts || [];
        const finishReason = typed.candidates?.[0]?.finishReason;
        
        if (finishReason && finishReason !== 'STOP') {
          console.log(`[Gemini API] Chunk finishReason: ${finishReason}`);
        }

        for (const part of candidates) {
          if (part.functionCall) {
            const call = part.functionCall;
            functionCalls.push(call);
            functionCallParts.push({
              functionCall: {
                name: call.name,
                args: call.args
              },
              thoughtSignature: part.thoughtSignature
            });
          }
        }
        
        // If we found at least one function call, we can stop buffering early
        // but we should continue processing the current chunk's parts
        if (functionCalls.length > 0) {
          // Check if we have terminal tools that need immediate handling
          const hasTerminalTool = functionCalls.some(c => c.name === "ignore_user" || c.name === "start_voice_session");
          if (hasTerminalTool) break;
        }
      }

      // T4: Buffering complete
      const bufferingCompleteTime = Date.now();
      console.log(`[Request Lifecycle] Buffering: ${bufferingCompleteTime - (firstChunkTime || bufferStart)}ms (T4-T3)`);
      console.log(`[Request Lifecycle] Buffered ${bufferedChunks.length} chunks in ${bufferingCompleteTime - bufferStart}ms`);

      // If function call detected early, handle it and return JSON (no stream)
      const ignoreUserCall = functionCalls.find(c => c.name === "ignore_user");
      const ignoreUserPart = functionCallParts.find(p => p.functionCall.name === "ignore_user");
      
      if (ignoreUserCall) {
        // Initialize state controller
        const turnNumber = Math.ceil(messages.length / 2);
        const state = createStateController({
          mode: 'text',
          isActive: true
        }) as StateController;

        // Record tool call
        recordToolCall(
          conversationHash,
          turnNumber,
          'ignore_user',
          ignoreUserCall.args || {},
          ignoreUserPart?.thoughtSignature,
          0
        );

        // Get tool metadata
        const toolMetadata = toolRegistry.getToolMetadata('ignore_user') as ToolMetadata | null;

        // Build execution context
        const executionContext = {
          clientId: `text-${Date.now()}`,
          ws: null,  // No WebSocket in text mode
          geminiSession: null,
          args: ignoreUserCall.args,
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
            toolMetadata: (toolMetadata || {}) as object,
            clientId: `text-${Date.now()}`
          }
        );
        const duration = Date.now() - startTime;

        const ignoreUserArgs = toRecord(ignoreUserCall.args || {});

        // Record tool result
        recordToolResult(
          conversationHash,
          turnNumber,
          'ignore_user',
          result.ok ? (result.data as Record<string, unknown>) : {
            error: true,
            type: result.error.type,
            message: result.error.message,
            retryable: result.error.retryable,
            details: result.error.details
          },
          0
        );

        // Collect observability data
        if (observability) {
          observability.toolCalls.push({
            position: observability.toolCalls.length + 1,
            chainPosition: 0,
            toolId: 'ignore_user',
            args: ignoreUserArgs,
            thoughtSignature: ignoreUserPart?.thoughtSignature,
            startTime: startTime,
            duration: duration,
            ok: result.ok,
            result: result.ok ? result.data : null,
            error: result.ok ? null : result.error
          });
          observability.totalDuration = Date.now() - observability.requestStartTime;
        }

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
          const response = {
            message: result.data.farewellMessage || ignoreUserArgs.farewell_message,
            timeout: {
              duration: result.data.durationSeconds || ignoreUserArgs.duration_seconds,
              until: result.data.timeoutUntil
            }
          };
          
          // Append observability if enabled
          if (observability) {
            (response as { observability?: ObservabilityData }).observability = {
              contextStack: observability.contextStack,
              toolCalls: observability.toolCalls,
              chainedCalls: observability.chainedCalls,
              totalDuration: observability.totalDuration,
              finalResponseLength: JSON.stringify(response).length,
              requestStartTime: observability.requestStartTime
            };
          }
          
          return NextResponse.json(response);
        } else {
          console.error('ignore_user tool failed:', result.error);
          const errorResponse = {
            error: result.error.message
          };
          
          // Append observability even on error
          if (observability) {
            (errorResponse as { observability?: ObservabilityData }).observability = {
              contextStack: observability.contextStack,
              toolCalls: observability.toolCalls,
              chainedCalls: observability.chainedCalls,
              totalDuration: observability.totalDuration,
              finalResponseLength: JSON.stringify(errorResponse).length,
              requestStartTime: observability.requestStartTime
            };
          }
          
          return NextResponse.json(errorResponse, { status: 500 });
        }
      }

      // Handle start_voice_session tool call
      const startVoiceCall = functionCalls.find(c => c.name === "start_voice_session");
      const startVoicePart = functionCallParts.find(p => p.functionCall.name === "start_voice_session");

      if (startVoiceCall) {
        // Initialize state controller
        const turnNumber = Math.ceil(messages.length / 2);
        const state = createStateController({
          mode: 'text',
          isActive: true
        }) as StateController;

        // Record tool call
        recordToolCall(
          conversationHash,
          turnNumber,
          'start_voice_session',
          startVoiceCall.args || {},
          startVoicePart?.thoughtSignature,
          0
        );

        const toolMetadata = toolRegistry.getToolMetadata('start_voice_session') as ToolMetadata | null;

        const executionContext = {
          clientId: `text-${Date.now()}`,
          ws: null,
          geminiSession: null,
          args: startVoiceCall.args || {},
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
            toolMetadata: toolMetadata ? (toolMetadata as object) : {},
            clientId: `text-${Date.now()}`
          }
        );
        const duration = Date.now() - startTime;

        // Record tool result
        recordToolResult(
          conversationHash,
          turnNumber,
          'start_voice_session',
          result.ok ? (result.data as Record<string, unknown>) : {
            error: true,
            type: result.error.type,
            message: result.error.message,
            retryable: result.error.retryable,
            details: result.error.details
          },
          0
        );

        // Collect observability data
        if (observability) {
          observability.toolCalls.push({
            position: observability.toolCalls.length + 1,
            chainPosition: 0,
            toolId: 'start_voice_session',
            args: startVoiceCall.args || {},
            thoughtSignature: startVoicePart?.thoughtSignature,
            startTime: startTime,
            duration: duration,
            ok: result.ok,
            result: result.ok ? result.data : null,
            error: result.ok ? null : result.error
          });
          observability.totalDuration = Date.now() - observability.requestStartTime;
        }

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
          // Filter out empty or too-short pending_request values
          // Schema allows null/empty, but we normalize to null for consistency
          let pendingRequest = startVoiceCall.args?.pending_request || null;
          if (pendingRequest && typeof pendingRequest === 'string' && pendingRequest.trim().length < 3) {
            pendingRequest = null;
          }

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

          const response = {
            message: messageText,
            startVoiceSession: true,
            pendingRequest: pendingRequest
          };
          
          // Append observability if enabled
          if (observability) {
            (response as { observability?: ObservabilityData }).observability = {
              contextStack: observability.contextStack,
              toolCalls: observability.toolCalls,
              chainedCalls: observability.chainedCalls,
              totalDuration: observability.totalDuration,
              finalResponseLength: JSON.stringify(response).length,
              requestStartTime: observability.requestStartTime
            };
          }
          
          return NextResponse.json(response);
        } else {
          console.error('start_voice_session tool failed:', result.error);
          const errorResponse = {
            error: result.error.message
          };
          
          // Append observability even on error
          if (observability) {
            (errorResponse as { observability?: ObservabilityData }).observability = {
              contextStack: observability.contextStack,
              toolCalls: observability.toolCalls,
              chainedCalls: observability.chainedCalls,
              totalDuration: observability.totalDuration,
              finalResponseLength: JSON.stringify(errorResponse).length,
              requestStartTime: observability.requestStartTime
            };
          }
          
          return NextResponse.json(errorResponse, { status: 500 });
        }
      }

      // Handle all other function calls (kb_search, kb_get, end_voice_session, etc.)
      const otherFunctionCall = functionCalls.find(c => c.name !== "ignore_user" && c.name !== "start_voice_session");
      const otherFunctionPart = functionCallParts.find(p => p.functionCall.name !== "ignore_user" && p.functionCall.name !== "start_voice_session");
      
      if (otherFunctionCall && otherFunctionCall.name) {
        const toolName = otherFunctionCall.name;
        console.log(`Handling function call: ${toolName}`);
        const toolErrorNotices: Array<{ toolName: string; type: string; message: string }> = [];
        
        // Initialize state controller
        const turnNumber = Math.ceil(messages.length / 2);
        const state = createStateController({
          mode: 'text',
          isActive: true
        }) as StateController;

        // Record tool call
        recordToolCall(
          conversationHash,
          turnNumber,
          toolName,
          otherFunctionCall.args || {},
          otherFunctionPart?.thoughtSignature,
          0
        );

        // Get tool metadata
        const toolMetadata = toolRegistry.getToolMetadata(toolName) as ToolMetadata | null;
        
        if (!toolMetadata) {
          console.error(`Unknown tool: ${toolName}`);
          return NextResponse.json({
            error: `Unknown tool: ${toolName}`
          }, { status: 400 });
        }

        // Build execution context
        const sessionId = userId || 'anonymous-text-session';
        const executionContext = {
          clientId: `text-${Date.now()}`,
          ws: null,
          geminiSession: null,
          args: otherFunctionCall.args || {},
          capabilities: { voice: false },
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          },
          meta: {
            perplexityApiKey: process.env.PERPLEXITY_API_KEY
          }
        };

        // Pre-execution deduplication check (tool memory)
        const dedupCheck = toolMemoryDedup.checkForDuplicate(
          sessionId,
          toolName,
          otherFunctionCall.args || {}
        );

        let result;
        let duration;
        const startTime = Date.now();

        if (dedupCheck.isDuplicate) {
          console.log(`[ToolMemory] Reusing cached result for ${toolName} (call: ${dedupCheck.originalCallId})`);
          result = dedupCheck.cachedResult;
          duration = Date.now() - startTime; // Should be ~0ms (instant)
        } else {
        // Check for loop before execution
        const loopCheck = loopDetector.detectLoop(sessionId, turnNumber, toolName, otherFunctionCall.args || {});
        if (loopCheck.detected) {
          console.warn(`[Loop Detection] Loop detected for ${toolName}: ${loopCheck.message}`);
          result = {
            ok: false,
            error: {
              type: 'LOOP_DETECTED',
              message: loopCheck.message,
              retryable: false
            }
          };
        } else {
          // Record call
          loopDetector.recordCall(sessionId, turnNumber, toolName, otherFunctionCall.args || {}, null);

          // Execute tool through registry with retry logic
          result = await retryToolExecution(
            () => toolRegistry.executeTool(toolName, executionContext),
            {
              mode: 'text',
              maxRetries: 3,
              toolId: toolName,
              toolMetadata: toolMetadata ? (toolMetadata as object) : {},
              clientId: `text-${Date.now()}`
            }
          );
        }
          duration = Date.now() - startTime;

          // Enhanced timing log for slow tool calls
          if (duration > 500) {
            console.log(`[Tool] ⏱️ SLOW TOOL CALL: ${toolName} took ${duration}ms`);
            if (result.meta?._timing) {
              console.log(`[Tool] ⏱️ Breakdown: ${JSON.stringify(result.meta._timing)}`);
            }
          }

          // Record in tool memory store (post-execution)
          const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          toolMemoryStore.recordToolCall(sessionId, {
            id: callId,
            toolId: toolName,
            args: otherFunctionCall.args || {},
            argsHash: hashArgs(otherFunctionCall.args || {}),
            timestamp: Date.now(),
            turn: 1, // TODO: Track actual turn number
            duration: duration,
            fullResponse: result,
            summary: null, // Will be generated async
            ok: result.ok,
            error: result.ok ? null : result.error,
            tokens: estimateTokensForJson(JSON.stringify(result))
          });
        }

        // Collect observability data
        if (observability) {
          observability.toolCalls.push({
            position: observability.toolCalls.length + 1,
            chainPosition: 0,
            toolId: toolName,
            args: otherFunctionCall.args || {},
            thoughtSignature: otherFunctionPart?.thoughtSignature,
            startTime: startTime,
            duration: duration,
            ok: result.ok,
            result: result.ok ? result.data : null,
            error: result.ok ? null : result.error
          });
          observability.totalDuration = Date.now() - observability.requestStartTime;
        }

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

        // Handle tool errors by sending them back to the model
        // The model will interpret the error and respond naturally to the user
        if (!result.ok) {
          console.error(`${toolName} tool failed:`, result.error);
          
          // Don't return an error response - instead, send the error back to the model
          // as a functionResponse so it can handle it naturally
          // The error object already contains: type, message, retryable, details
        }

        // Check if KB search results are relevant
        let shouldAddRelevanceGuidance = false;
        if (toolName === 'kb_search' && result.ok && result.data) {
          const kbData = result.data as { query?: string; results?: Array<{ score?: number; title?: string; snippet?: string; id?: string }> };
          const query = kbData.query || '';
          const results = kbData.results || [];
          
          if (!areKbResultsRelevant(query, results)) {
            console.log(`[KB Search] Results appear irrelevant for query: "${query}"`);
            shouldAddRelevanceGuidance = true;
          }
        }

        // Continue conversation with tool result (success or error)
        // Add the function call and result to the conversation
        // IMPORTANT: Clean the result data to remove internal metadata (_timing, etc.) before sending to model
        const cleanedResultData = result.ok ? JSON.parse(JSON.stringify(result.data)) : null;

        // Extract image data for multimodal analysis before cleaning
        let imageData = null;
        if (cleanedResultData && typeof cleanedResultData === 'object' && cleanedResultData._imageData) {
          imageData = cleanedResultData._imageData;
          console.log(`[Image Data] Extracted from ${toolName} result:`, {
            mimeType: imageData?.mimeType,
            dataLength: imageData?.data?.length,
            hasData: !!(imageData?.mimeType && imageData?.data)
          });
          delete cleanedResultData._imageData; // Remove from response text
        } else if (toolName === 'kb_get') {
          console.log(`[Image Data] No _imageData in kb_get result. Result keys:`, cleanedResultData ? Object.keys(cleanedResultData) : 'null');
        }

        if (cleanedResultData && typeof cleanedResultData === 'object') {
          delete cleanedResultData._timing;
          delete cleanedResultData._distance;
          // Also clean nested results if they exist
          if (Array.isArray(cleanedResultData.results)) {
            cleanedResultData.results.forEach((r: any) => {
              if (r.metadata) {
                delete r.metadata._distance;
                delete r.metadata.vector;
              }
            });
          }

          // Truncate large kb_get content field to reduce API latency
          if (toolName === 'kb_get' && cleanedResultData.content) {
            const maxLength = 2000; // ~500 tokens
            if (cleanedResultData.content.length > maxLength) {
              const originalLength = cleanedResultData.content.length;
              const truncated = cleanedResultData.content.substring(0, maxLength);
              cleanedResultData.content = truncated + '\n\n... [Content truncated for performance. Full content available in chunks.]';
              cleanedResultData._truncated = true;
              console.log(`[Performance] Truncated kb_get content from ${originalLength} to ${maxLength} chars`);
            }
          }
        }

        // Record tool result with cleaned data (same as what gets sent to Gemini)
        recordToolResult(
          conversationHash,
          turnNumber,
          toolName,
          result.ok ? (cleanedResultData as Record<string, unknown>) : {
            error: true,
            type: result.error.type,
            message: result.error.message,
            retryable: result.error.retryable,
            details: result.error.details
          },
          0
        );

    // Build response parts - include functionResponse
    const responseParts: any[] = [
      {
        functionResponse: {
          name: toolName,
          // Send cleaned data to model
          response: result.ok ? (cleanedResultData as Record<string, unknown>) : {
            error: true,
            type: result.error.type,
            message: result.error.message,
            retryable: result.error.retryable,
            details: result.error.details
          }
        }
      }
    ];

    // Note: Removed sibling text part to avoid confusing Gemini 3 tool-calling logic.
    // Guidance is already included in tool schemas and core prompt.

    // Add image data as separate part for multimodal analysis if available
        // This enables pixel-level analysis grounded in the metadata context
        if (imageData && imageData.mimeType && imageData.data) {
          responseParts.push({
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.data
            }
          });
          const dataSizeKB = Math.round(imageData.data.length / 1024);
          console.log(`[Multimodal] ✓ Including image data for ${toolName} (${imageData.mimeType}, ${dataSizeKB}KB) in Gemini API call`);
        } else {
          console.log(`[Multimodal] ✗ No image data to include for ${toolName}`);
        }

        const updatedContents = [
          ...contentsToSend,
          {
            role: "model" as const,
            parts: [
              // Use the preserved functionCallPart which includes thoughtSignature
              (otherFunctionPart as FunctionCallPart) || {
                functionCall: {
                  name: toolName,
                  args: otherFunctionCall.args || {}
                }
              }
            ]
          },
          {
            role: "user" as const,
            parts: responseParts
          }
        ];

        if (toolName === "kb_search" && result.ok && isVisualShowRequest(lastUserMessageText)) {
          const autoAssetId = selectTopVisualResultId(
            Array.isArray(cleanedResultData?.results) ? cleanedResultData.results : []
          );

          if (autoAssetId) {
            const autoToolName = "kb_get";
            // Auto-chain never includes image data by default - we only want the metadata/markdown link
            const autoArgs = { id: autoAssetId, include_image_data: false };
            const autoToolMetadata = toolRegistry.getToolMetadata(autoToolName) as ToolMetadata | null;

            if (autoToolMetadata) {
              console.log(`[AutoChain] Detected visual request, auto-fetching asset ${autoAssetId}`);

              // Record auto-chained tool call
              recordToolCall(
                conversationHash,
                turnNumber,
                autoToolName,
                autoArgs,
                undefined,
                1
              );

              const autoStartTime = Date.now();
              let autoResult;

              const autoLoopCheck = loopDetector.detectLoop(sessionId, turnNumber, autoToolName, autoArgs);
              if (autoLoopCheck.detected) {
                console.warn(`[Loop Detection] Auto-chain loop detected for ${autoToolName}: ${autoLoopCheck.message}`);
                autoResult = {
                  ok: false,
                  error: {
                    type: "LOOP_DETECTED",
                    message: autoLoopCheck.message,
                    retryable: false
                  }
                };
              } else {
                loopDetector.recordCall(sessionId, turnNumber, autoToolName, autoArgs, null);
                autoResult = await retryToolExecution(
                  () => toolRegistry.executeTool(autoToolName, { ...executionContext, args: autoArgs }),
                  {
                    mode: "text",
                    maxRetries: 3,
                    toolId: autoToolName,
                    toolMetadata: autoToolMetadata ? (autoToolMetadata as object) : {},
                    clientId: `text-${Date.now()}`
                  }
                );
              }

              const autoDuration = Date.now() - autoStartTime;
              const autoCallId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              toolMemoryStore.recordToolCall(sessionId, {
                id: autoCallId,
                toolId: autoToolName,
                args: autoArgs,
                argsHash: hashArgs(autoArgs),
                timestamp: Date.now(),
                turn: 1, // TODO: Track actual turn number
                duration: autoDuration,
                fullResponse: autoResult,
                summary: null,
                ok: autoResult.ok,
                error: autoResult.ok ? null : autoResult.error,
                tokens: estimateTokensForJson(JSON.stringify(autoResult))
              });

              if (observability) {
                observability.toolCalls.push({
                  position: observability.toolCalls.length + 1,
                  chainPosition: 1,
                  toolId: autoToolName,
                  args: autoArgs,
                  thoughtSignature: undefined,
                  startTime: autoStartTime,
                  duration: autoDuration,
                  ok: autoResult.ok,
                  result: autoResult.ok ? autoResult.data : null,
                  error: autoResult.ok ? null : autoResult.error
                });
                observability.chainedCalls += 1;
                observability.totalDuration = Date.now() - observability.requestStartTime;
              }

              const cleanedAutoResultData = autoResult.ok ? JSON.parse(JSON.stringify(autoResult.data)) : null;
              let autoImageData = null;
              if (cleanedAutoResultData && typeof cleanedAutoResultData === "object" && cleanedAutoResultData._imageData) {
                autoImageData = cleanedAutoResultData._imageData;
                delete cleanedAutoResultData._imageData;
              }

              if (cleanedAutoResultData && typeof cleanedAutoResultData === "object") {
                delete cleanedAutoResultData._timing;
                delete cleanedAutoResultData._distance;
              }

              // Record auto-chained tool result
              recordToolResult(
                conversationHash,
                turnNumber,
                autoToolName,
                autoResult.ok ? (cleanedAutoResultData as Record<string, unknown>) : {
                  error: true,
                  type: autoResult.error.type,
                  message: autoResult.error.message,
                  retryable: autoResult.error.retryable,
                  details: autoResult.error.details
                },
                1
              );

              // Build auto-chained response parts
              const autoResponseParts: any[] = [
                {
                  functionResponse: {
                    name: autoToolName,
                    response: autoResult.ok ? (cleanedAutoResultData as Record<string, unknown>) : {
                      error: true,
                      type: autoResult.error.type,
                      message: autoResult.error.message,
                      retryable: autoResult.error.retryable,
                      details: autoResult.error.details
                    }
                  }
                }
              ];

              // Note: Removed sibling text part to avoid confusing Gemini 3 tool-calling logic.

              if (autoImageData && autoImageData.mimeType && autoImageData.data) {
                autoResponseParts.push({
                  inlineData: {
                    mimeType: autoImageData.mimeType,
                    data: autoImageData.data
                  }
                });
              }

              updatedContents.push(
                {
                  role: "model" as const,
                  parts: [{ functionCall: { name: autoToolName, args: autoArgs } }]
                },
                {
                  role: "user" as const,
                  parts: autoResponseParts
                }
              );

              if (!autoResult.ok) {
                toolErrorNotices.push({
                  toolName: autoToolName,
                  type: autoResult.error.type,
                  message: autoResult.error.message
                });
                updatedContents.push({
                  role: "user" as const,
                  parts: [{
                    text: `IMPORTANT: The tool "${autoToolName}" failed with a ${autoResult.error.type} error. You must tell the user this happened and include the error message verbatim: "${autoResult.error.message}". If the message includes suggestions or next steps, surface them explicitly.`
                  }]
                });
              }
            }
          }
        }

        if (!result.ok) {
          toolErrorNotices.push({
            toolName,
            type: result.error.type,
            message: result.error.message
          });
          updatedContents.push({
            role: "user" as const,
            parts: [{
              text: `IMPORTANT: The tool "${toolName}" failed with a ${result.error.type} error. You must tell the user this happened and include the error message verbatim: "${result.error.message}". If the message includes suggestions or next steps, surface them explicitly.`
            }]
          });
        }

        // Add guidance if KB search results are irrelevant
        if (shouldAddRelevanceGuidance) {
          updatedContents.push({
            role: "user" as const,
            parts: [{
              text: "IMPORTANT: The KB search results above do not appear relevant to the query. The scores are low and the results don't match the search terms. If the user is asking about something not in the knowledge base, you should:\n1. Acknowledge that it's not in your records\n2. If appropriate, use perplexity_search to find information on the web\n3. Do NOT keep searching the KB repeatedly - acknowledge the gap and move on"
            }]
          });
        }

        console.log("=== Function call conversation ===");
        console.log("Function called:", toolName);
        console.log("Function result:", JSON.stringify(result.data, null, 2));
        console.log("Updated contents length:", updatedContents.length);

        // Make a new API call with the tool result
        debugLog(`Preparing follow-up stream for tool: ${toolName}`);
        const followUpStream = await retryWithBackoff(async () => {
          const config: GeminiConfig = {};

          // Use cached content if available
          if (cachedContent && cachedContent.trim()) {
            config.cachedContent = cachedContent;
          } else {
            config.tools = [{ functionDeclarations: providerSchemas }];
            config.systemInstruction = FRAM_SYSTEM_PROMPT;
          }

          console.log("=== Follow-up API call after tool execution ===");
          console.log(`Tool: ${toolName}`);
          console.log(`Contents length: ${updatedContents.length}`);
          console.log(`Using cached content: ${!!config.cachedContent}`);
          console.log(`Tools in config: ${!!config.tools}`);
          
          try {
             debugLog(`Calling generateContentStream for tool: ${toolName}`);
             const result = await ai.models.generateContentStream({
                model: "gemini-2.5-flash",
                contents: updatedContents,
                config
             });
             debugLog(`generateContentStream returned for tool: ${toolName}`);
             return result;
          } catch (err) {
             debugLog(`generateContentStream failed for tool: ${toolName} - ${err}`);
             
             // If cache error and we're using cache, retry without cache
             if (isCacheError(err) && config.cachedContent) {
               console.warn(`Cache error detected, retrying without cache for tool: ${toolName}`);
               debugLog(`Retrying without cache for tool: ${toolName}`);
               
               // Retry without cache
               const fallbackConfig: GeminiConfig = {
                 tools: [{ functionDeclarations: providerSchemas }],
                 systemInstruction: FRAM_SYSTEM_PROMPT
               };
               
               return await ai.models.generateContentStream({
                 model: "gemini-2.5-flash",
                 contents: updatedContents,
                 config: fallbackConfig
               });
             }
             
             throw err;
          }
        });

        // Support chained function calls (up to 5 in a row)
        const MAX_CHAIN_LENGTH = 5;
        let chainCount = 0;
        let currentContents = updatedContents;
        let currentStream = followUpStream;

        // Stream the follow-up response (with chained function call support)
        return new Response(
          new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              let totalBytesSent = 0;
              let accumulatedFullText = "";

              try {
                // Note: Initial tool status was already shown during execution.
                // Only emit status for chained tool calls inside the loop.

                // Phase 3: Track chain metrics
                const chainMetrics: Array<{
                  chainIndex: number;
                  toolName: string;
                  toolExecutionMs: number;
                  geminiTTFTMs: number;
                  contextTokensAdded: number;
                  totalChainStepMs: number;
                }> = [];

                // Loop to handle chained function calls
                while (chainCount < MAX_CHAIN_LENGTH) {
                  // Extract function calls and text from stream chunks as they arrive
                  let nextFunctionCall: FunctionCall | null = null;
                  let nextFunctionCallPart: FunctionCallPart | null = null;
                  let responseText = "";

                  // Accumulate function call data across chunks
                  const accumulatedFunctionCall: Partial<FunctionCall> = {};
                  let accumulatedThoughtSignature: string | undefined = undefined;
                  let hasFunctionCall = false;

                  const iterator = currentStream[Symbol.asyncIterator]();
                  let chunkCount = 0;
                  let firstTokenTime: number | null = null;
                  const streamStartTime = Date.now();
                  const debugChunks: unknown[] = [];

                  while (true) {
                    const { value, done } = await iterator.next();
                    if (done) break;
                    
                    if (firstTokenTime === null) {
                      firstTokenTime = Date.now();
                      console.log(`[Chain ${chainCount}] First token received in ${firstTokenTime - streamStartTime}ms`);
                    }
                    
                    chunkCount++;
                    const typed = value as StreamChunk;
                    debugChunks.push(typed);
                    const candidates: StreamChunkPart[] = typed?.candidates?.[0]?.content?.parts || [];

                    // Process parts in this chunk
                    for (const part of candidates) {
                      // 1. Handle Text (Stream immediately for better TTFT)
                      if (part.text) {
                        responseText += part.text;
                        const encoded = encoder.encode(part.text);
                        totalBytesSent += encoded.length;
                        controller.enqueue(encoded);
                      }

                      // 2. Handle Function Calls (Accumulate)
                      if (part.functionCall) {
                        hasFunctionCall = true;
                        if (part.functionCall.name) accumulatedFunctionCall.name = part.functionCall.name;
                        
                        // thoughtSignature is a SIBLING of functionCall in the part
                        if (part.thoughtSignature) {
                          accumulatedThoughtSignature = part.thoughtSignature;
                        }
                        
                        if (part.functionCall.args) {
                          accumulatedFunctionCall.args = { ...accumulatedFunctionCall.args, ...part.functionCall.args };
                        }
                      }
                    }
                  }
                  debugLog(`Stream iteration complete. ${chunkCount} chunks.`);

                  if (hasFunctionCall && accumulatedFunctionCall.name) {
                     nextFunctionCall = accumulatedFunctionCall as FunctionCall;
                     // Build the part with thoughtSignature as a SIBLING of functionCall
                     nextFunctionCallPart = {
                       functionCall: nextFunctionCall,
                       thoughtSignature: accumulatedThoughtSignature
                     };
                     
                     if (!accumulatedThoughtSignature) {
                        console.error(`[Chain ${chainCount}] MISSING thoughtSignature! Dumping chunks to chunks_debug.json`);
                        try {
                           fs.writeFileSync('chunks_debug.json', JSON.stringify(debugChunks, null, 2));
                        } catch (e) {
                           console.error('Failed to write chunks debug file', e);
                        }
                     }
                  }

                  // If there's a function call, execute it and loop
                  if (nextFunctionCall && nextFunctionCall.name) {
                    chainCount++;
                    const chainedToolName = nextFunctionCall.name;
                    console.log(`[Chain ${chainCount}/${MAX_CHAIN_LENGTH}] Executing chained function: ${chainedToolName}`);

                    // Record chained tool call
                    recordToolCall(
                      conversationHash,
                      turnNumber,
                      chainedToolName,
                      nextFunctionCall.args || {},
                      nextFunctionCallPart?.thoughtSignature,
                      chainCount
                    );

                    // Emit status for chained tool call
                    const chainedStatus = buildToolStatus(chainedToolName, nextFunctionCall.args || {});
                    const chainedStatusEvent = encodeStatusEvent(chainedStatus);
                    controller.enqueue(encoder.encode(chainedStatusEvent));

                    // Execute the chained tool
                    const chainedToolMetadata = toolRegistry.getToolMetadata(chainedToolName) as ToolMetadata | null;
                    if (!chainedToolMetadata) {
                      console.error(`Unknown chained tool: ${chainedToolName}`);
                      const errorMsg = `Error: Unknown tool "${chainedToolName}"`;
                      controller.enqueue(encoder.encode(errorMsg));
                      break;
                    }

                    // Debug: Check API key availability
                    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
                    console.log(`[Chain ${chainCount}] PERPLEXITY_API_KEY check:`, {
                      present: !!perplexityApiKey,
                      length: perplexityApiKey?.length || 0,
                      startsWith: perplexityApiKey?.substring(0, 4) || 'N/A'
                    });

                    const chainedExecutionContext = {
                      clientId: `text-${Date.now()}`,
                      ws: null,
                      geminiSession: null,
                      args: nextFunctionCall.args || {},
                      capabilities: { voice: false },
                      session: {
                        isActive: state.get('isActive'),
                        toolsVersion: toolRegistry.getVersion(),
                        state: state.getSnapshot()
                      },
                      meta: {
                        perplexityApiKey: perplexityApiKey
                      }
                    };

                    const chainedStartTime = Date.now();
                    let chainedResult;

                    // Check for loop before execution
                    const chainedLoopCheck = loopDetector.detectLoop(sessionId, turnNumber, chainedToolName, nextFunctionCall.args || {});
                    if (chainedLoopCheck.detected) {
                      console.warn(`[Loop Detection] Chained loop detected for ${chainedToolName}: ${chainedLoopCheck.message}`);
                      chainedResult = {
                        ok: false,
                        error: {
                          type: 'LOOP_DETECTED',
                          message: chainedLoopCheck.message,
                          retryable: false
                        }
                      };
                    } else {
                      // Record call
                      loopDetector.recordCall(sessionId, turnNumber, chainedToolName, nextFunctionCall.args || {}, null);

                      chainedResult = await retryToolExecution(
                        () => toolRegistry.executeTool(chainedToolName, chainedExecutionContext),
                        {
                          mode: 'text',
                          maxRetries: 3,
                          toolId: chainedToolName,
                          toolMetadata: chainedToolMetadata,
                          clientId: `text-${Date.now()}`
                        }
                      );
                    }
                    const chainedDuration = Date.now() - chainedStartTime;

                    // Track tool execution time for chain metrics
                    const toolExecutionTime = chainedDuration;
                    const geminiTTFT = firstTokenTime ? firstTokenTime - streamStartTime : 0;
                    const estimatedTokensAdded = chainedResult.ok ? estimateTokens(JSON.stringify(chainedResult.data)) : 0;
                    const totalChainStepTime = (Date.now() - chainedStartTime) + (firstTokenTime ? firstTokenTime - streamStartTime : 0);

                    // Add to chain metrics
                    chainMetrics.push({
                      chainIndex: chainCount,
                      toolName: chainedToolName,
                      toolExecutionMs: toolExecutionTime,
                      geminiTTFTMs: geminiTTFT,
                      contextTokensAdded: estimatedTokensAdded,
                      totalChainStepMs: totalChainStepTime
                    });

                    console.log(`[Chain Analysis] Chain ${chainCount} (${chainedToolName}): tool=${toolExecutionTime}ms, TTFT=${geminiTTFT}ms, total=${totalChainStepTime}ms, +${estimatedTokensAdded} tokens`);

                    // Collect observability data for chained calls
                    if (observability) {
                      observability.toolCalls.push({
                        position: observability.toolCalls.length + 1,
                        chainPosition: chainCount,
                        toolId: chainedToolName,
                        args: nextFunctionCall.args || {},
                        thoughtSignature: nextFunctionCallPart?.thoughtSignature,
                        startTime: chainedStartTime,
                        duration: chainedDuration,
                        ok: chainedResult.ok,
                        result: chainedResult.ok ? chainedResult.data : null,
                        error: chainedResult.ok ? null : chainedResult.error
                      });
                      observability.chainedCalls = chainCount;
                      observability.totalDuration = Date.now() - observability.requestStartTime;
                    }

                    console.log(JSON.stringify({
                      event: 'chained_tool_execution',
                      toolId: chainedToolName,
                      chainPosition: chainCount,
                      toolVersion: chainedToolMetadata?.version || 'unknown',
                      registryVersion: toolRegistry.getVersion(),
                      duration: chainedDuration,
                      ok: chainedResult.ok,
                      category: chainedToolMetadata?.category || 'unknown',
                      mode: 'text'
                    }));

                    // Handle chained tool errors by sending them back to the model
                    // The model will interpret the error and respond naturally
                    if (!chainedResult.ok) {
                      console.error(`Chained tool ${chainedToolName} failed:`, chainedResult.error);
                      // Don't break - let the model handle the error naturally
                    }

                    // Update contents with this function call and result (success or error)
                    // Clean result data before sending to model
                    const cleanedChainedResultData = chainedResult.ok ? JSON.parse(JSON.stringify(chainedResult.data)) : null;

                    // Extract image data for multimodal analysis before cleaning (chained calls)
                    let chainedImageData = null;
                    if (cleanedChainedResultData && typeof cleanedChainedResultData === 'object' && cleanedChainedResultData._imageData) {
                      chainedImageData = cleanedChainedResultData._imageData;
                      console.log(`[Image Data] Extracted from chained ${chainedToolName}:`, {
                        mimeType: chainedImageData?.mimeType,
                        dataLength: chainedImageData?.data?.length
                      });
                      delete cleanedChainedResultData._imageData; // Remove from response text
                    } else if (chainedToolName === 'kb_get') {
                      console.log(`[Image Data] No _imageData in chained kb_get result`);
                    }

                    if (cleanedChainedResultData && typeof cleanedChainedResultData === 'object') {
                      delete cleanedChainedResultData._timing;
                      delete cleanedChainedResultData._distance;
                      if (Array.isArray(cleanedChainedResultData.results)) {
                        cleanedChainedResultData.results.forEach((r: any) => {
                          if (r.metadata) {
                            delete r.metadata._distance;
                            delete r.metadata.vector;
                          }
                        });
                      }

                      // Truncate large kb_get content field to reduce API latency
                      if (chainedToolName === 'kb_get' && cleanedChainedResultData.content) {
                        const maxLength = 2000; // ~500 tokens
                        if (cleanedChainedResultData.content.length > maxLength) {
                          const originalLength = cleanedChainedResultData.content.length;
                          const truncated = cleanedChainedResultData.content.substring(0, maxLength);
                          cleanedChainedResultData.content = truncated + '\n\n... [Content truncated for performance. Full content available in chunks.]';
                          cleanedChainedResultData._truncated = true;
                          console.log(`[Performance] Truncated chained kb_get content from ${originalLength} to ${maxLength} chars`);
                        }
                      }
                    }

                    // Record chained tool result with cleaned data
                    recordToolResult(
                      conversationHash,
                      turnNumber,
                      chainedToolName,
                      chainedResult.ok ? (cleanedChainedResultData as Record<string, unknown>) : {
                        error: true,
                        type: chainedResult.error.type,
                        message: chainedResult.error.message,
                        retryable: chainedResult.error.retryable,
                        details: chainedResult.error.details
                      },
                      chainCount
                    );

                    // Build chained response parts - include functionResponse
                    const chainedResponseParts: any[] = [
                      {
                        functionResponse: {
                          name: chainedToolName,
                          // Send cleaned info back to model
                          response: chainedResult.ok ? (cleanedChainedResultData as Record<string, unknown>) : {
                            error: true,
                            type: chainedResult.error.type,
                            message: chainedResult.error.message,
                            retryable: chainedResult.error.retryable,
                            details: chainedResult.error.details
                          }
                        }
                      }
                    ];

                    // Note: Removed sibling text part to avoid confusing Gemini 3 tool-calling logic.

                    // Add image data for chained calls too
                    if (chainedImageData && chainedImageData.mimeType && chainedImageData.data) {
                      chainedResponseParts.push({
                        inlineData: {
                          mimeType: chainedImageData.mimeType,
                          data: chainedImageData.data
                        }
                      });
                      const chainedDataSizeKB = Math.round(chainedImageData.data.length / 1024);
                      console.log(`[Multimodal] ✓ Including image data for chained ${chainedToolName} (${chainedImageData.mimeType}, ${chainedDataSizeKB}KB)`);
                    } else if (chainedToolName === 'kb_get') {
                      console.log(`[Multimodal] ✗ No image data to include for chained kb_get`);
                    }

                    currentContents = [
                      ...currentContents,
                      {
                        role: "model" as const,
                        parts: [nextFunctionCallPart || { functionCall: nextFunctionCall }]
                      },
                      {
                        role: "user" as const,
                        parts: chainedResponseParts
                      }
                    ];

                    if (!chainedResult.ok) {
                      toolErrorNotices.push({
                        toolName: chainedToolName,
                        type: chainedResult.error.type,
                        message: chainedResult.error.message
                      });
                      currentContents.push({
                        role: "user" as const,
                        parts: [{
                          text: `IMPORTANT: The tool "${chainedToolName}" failed with a ${chainedResult.error.type} error. You must tell the user this happened and include the error message verbatim: "${chainedResult.error.message}". If the message includes suggestions or next steps, surface them explicitly.`
                        }]
                      });
                    }

                    console.log(`[Chain ${chainCount}] Tool result received, continuing conversation`);

                    // Check if chained KB search results are irrelevant
                    if (chainedToolName === 'kb_search' && chainedResult.ok && chainedResult.data) {
                      const kbData = chainedResult.data as { query?: string; results?: Array<{ score?: number; title?: string; snippet?: string; id?: string }> };
                      const query = kbData.query || '';
                      const results = kbData.results || [];
                      
                      if (!areKbResultsRelevant(query, results)) {
                        console.log(`[Chain ${chainCount}] KB Search results appear irrelevant for query: "${query}"`);
                        // Add guidance to stop chaining and acknowledge gap
                        currentContents.push({
                          role: "user" as const,
                          parts: [{
                            text: "IMPORTANT: The KB search results above do not appear relevant to the query. The scores are low and the results don't match the search terms. Stop searching the KB and acknowledge that this information is not in your records. If appropriate, use perplexity_search to find information on the web, or simply tell the user it's not documented."
                          }]
                        });
                      }
                    }

                    // Make another API call with the new tool result
                    const followUpStartTime = Date.now();
                    currentStream = await retryWithBackoff(async () => {
                      const config: GeminiConfig = {};

                      // Check if we can use or create a cache for this chained call
                      // This is critical for performance when tool results are large
                      if (cachedContent && cachedContent.trim()) {
                        config.cachedContent = cachedContent;
                      } else {
                        config.tools = [{ functionDeclarations: providerSchemas }];
                        config.systemInstruction = FRAM_SYSTEM_PROMPT;
                      }

                      try {
                        const chainApiCallStart = Date.now();
                        const stream = await ai.models.generateContentStream({
                          model: "gemini-2.5-flash",
                          contents: currentContents,
                          config
                        });
                        const chainStreamCreated = Date.now();
                        console.log(`[Chain ${chainCount}] Follow-up stream created in ${chainStreamCreated - chainApiCallStart}ms`);
                        console.log(`[Gemini API] Chain ${chainCount} network handshake: ${chainStreamCreated - followUpStartTime}ms`);
                        return stream;
                      } catch (err) {
                        // If cache error and we're using cache, retry without cache
                        if (isCacheError(err) && config.cachedContent) {
                          console.warn(`Cache error detected in chained call, retrying without cache`);
                          debugLog(`Retrying chained call without cache`);
                          
                          // Retry without cache
                          const fallbackConfig: GeminiConfig = {
                            tools: [{ functionDeclarations: providerSchemas }],
                            systemInstruction: FRAM_SYSTEM_PROMPT
                          };
                          
                          return await ai.models.generateContentStream({
                            model: "gemini-2.5-flash",
                            contents: currentContents,
                            config: fallbackConfig
                          });
                        }
                        
                        throw err;
                      }
                    });

                    // Loop back to process the new stream
                    continue;
                  }

                  // No more function calls, we're done
                  // (Text was already streamed chunk-by-chunk in the iteration loop above)
                  if (responseText) {
                    accumulatedFullText += responseText;
                    console.log(`Final response streamed: ${responseText.length} bytes (after ${chainCount} chained calls)`);
                  } else {
                    console.warn(`No text in final response after ${chainCount} chained calls`);
                  }

                  if (toolErrorNotices.length > 0) {
                    const missingNotices = toolErrorNotices.filter((notice) =>
                      !accumulatedFullText.includes(notice.message)
                    );
                    if (missingNotices.length > 0) {
                      const noticeText = missingNotices
                        .map((notice) => `Tool error (${notice.toolName}): ${notice.type} - "${notice.message}"`)
                        .join('\n');
                      const suffix = `\n\n${noticeText}`;
                      controller.enqueue(encoder.encode(suffix));
                      accumulatedFullText += suffix;
                    }
                  }

                  // Log chain metrics summary
                  if (chainMetrics.length > 0) {
                    const totalToolTime = chainMetrics.reduce((sum, m) => sum + m.toolExecutionMs, 0);
                    const totalModelTime = chainMetrics.reduce((sum, m) => sum + m.geminiTTFTMs, 0);
                    const totalChainTime = chainMetrics.reduce((sum, m) => sum + m.totalChainStepMs, 0);
                    console.log(`[Chain Analysis Summary] Total chains: ${chainMetrics.length}`);
                    console.log(`[Chain Analysis Summary] Tool time: ${totalToolTime}ms (${Math.round(totalToolTime / totalChainTime * 100)}%)`);
                    console.log(`[Chain Analysis Summary] Model time: ${totalModelTime}ms (${Math.round(totalModelTime / totalChainTime * 100)}%)`);
                    console.log(`[Chain Analysis Summary] Total chain cost: ${totalChainTime}ms`);
                  }

                  break; // Exit loop
                }

                if (chainCount >= MAX_CHAIN_LENGTH) {
                  console.warn(`Reached maximum chain length (${MAX_CHAIN_LENGTH}), stopping`);
                  const warningMsg = "\n\n(Reached maximum tool chain depth)";
                  controller.enqueue(encoder.encode(warningMsg));
                }

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

                // Append observability data if enabled
                  if (observability) {
                    try {
                      observability.finalResponseLength = totalBytesSent;
                      observability.totalDuration = Date.now() - observability.requestStartTime;
                      const observabilityJson = JSON.stringify({
                        contextStack: observability.contextStack,
                        toolCalls: observability.toolCalls,
                        chainedCalls: observability.chainedCalls,
                        totalDuration: observability.totalDuration,
                        finalResponseLength: observability.finalResponseLength
                      });
                      controller.enqueue(encoder.encode(`\n---OBSERVABILITY---\n${observabilityJson}`));
                    } catch (obsError) {
                      console.error("Error serializing observability data:", obsError);
                      // Send partial observability or error indication if serialization fails
                      try {
                        controller.enqueue(encoder.encode(`\n---OBSERVABILITY---\n${JSON.stringify({ error: "Serialization failed" })}`));
                      } catch (e) {
                         // Ignore secondary failure
                    }
                  }
                }
                
                // Record global token usage if userId is available
                if (userId && accumulatedFullText) {
                  const generatedTokens = countTokens(accumulatedFullText);
                  UsageService.recordUsage(userId, generatedTokens)
                    .then(usage => console.log(`[Usage] Recorded ${generatedTokens} tokens for ${userId}. Total: ${usage.totalTokens}`))
                    .catch(err => console.warn(`[Usage] Failed to record usage for ${userId}:`, err));
                }

                // Trigger background summarization for this turn (tool memory)
                toolMemorySummarizer.enqueueSummarization(userId || 'anonymous-text-session')
                  .catch(err => console.warn(`[ToolMemory] Summarization failed:`, err));

                // T6: Final response sent (chained path)
                const requestEndTime = Date.now();
                const totalRequestTime = requestEndTime - requestStartTime;
                console.log(`[Request Lifecycle] Total request time: ${totalRequestTime}ms`);
                console.log(`[Request Lifecycle Summary] Context: ${contextPrepTime - requestStartTime}ms | Gemini TTFT: ${(firstChunkTime || bufferStart) - geminiCallStart}ms | Streaming: ${requestEndTime - (firstChunkTime || bufferStart)}ms`);

                controller.close();
              } catch (error) {
                console.error("Error in chained tool execution:", error);
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
            let accumulatedFullText = "";

            const enqueueTextFromChunk = (chunk: unknown) => {
              const typed = chunk as { 
                text?: string | (() => string); 
                candidates?: Array<{ 
                  content?: { parts?: Array<{ text?: string, functionCall?: any }> },
                  finishReason?: string,
                  safetyRatings?: Array<{ category: string, probability: string }>
                }> 
              };
              const candidates = typed.candidates?.[0]?.content?.parts || [];
              const finishReason = typed.candidates?.[0]?.finishReason;

              // Try direct text property first
              let text: string | undefined;
              if (typeof typed.text === "function") {
                text = typed.text();
              } else if (typed.text) {
                text = typed.text;
              } else {
                // Iterate through all parts to find text parts
                // When there are function calls, parts can contain both text and functionCall parts
                const textParts: string[] = [];
                for (const part of candidates) {
                  if (part.text) {
                    textParts.push(part.text);
                  }
                }
                if (textParts.length > 0) {
                  text = textParts.join('');
                }
              }

              if (text) {
                accumulatedFullText += text;
                const encoded = encoder.encode(text);
                bytesSent += encoded.length;
                controller.enqueue(encoded);
                chunksProcessed++;
              } else {
                // Check for other important metadata if no text is present
                const finishReason = typed.candidates?.[0]?.finishReason;
                const safetyRatings = typed.candidates?.[0]?.safetyRatings;

                if (finishReason && finishReason !== 'STOP') {
                  console.log(`[Gemini API] Stream chunk finishReason: ${finishReason}`);
                  if (safetyRatings) {
                    console.log(`[Gemini API] Safety ratings:`, JSON.stringify(safetyRatings));
                  }
                }
                
                if (candidates.length > 0 && candidates.some((p: any) => p.functionCall)) {
                  // This is a function call chunk that wasn't handled in the early detection
                  // (shouldn't happen for the first turn, but good for debugging)
                  const calls = candidates.filter((p: any) => p.functionCall).map((p: any) => p.functionCall.name);
                  debugLog(`[Gemini API] Stream chunk contains function calls: ${calls.join(', ')}`);
                } else if (candidates.length > 0 && candidates.some((p: any) => p.thoughtSignature)) {
                  const thoughtPart = candidates.find((p: any) => p.thoughtSignature) as any;
                  debugLog(`[Gemini API] Stream chunk contains thoughtSignature (length: ${thoughtPart?.thoughtSignature?.length || 0})`);
                }
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

              // CRITICAL: Ensure we never return an empty response
              // If agent produced no text (only thinking blocks), provide a fallback
              if (!accumulatedFullText.trim()) {
                const fallbackMessage = "I'm ready to help. Could you please clarify what you'd like to know?";
                console.warn(`[Empty Response] Agent returned no text - using fallback message`);
                const encoded = encoder.encode(fallbackMessage);
                bytesSent += encoded.length;
                controller.enqueue(encoded);
                accumulatedFullText = fallbackMessage;
              }

              // T6: Final response sent (plain text path)
              const requestEndTime = Date.now();
              const totalRequestTime = requestEndTime - requestStartTime;
              console.log(`[Request Lifecycle] Total request time: ${totalRequestTime}ms`);
              console.log(`[Request Lifecycle Summary] Context: ${contextPrepTime - requestStartTime}ms | Gemini TTFT: ${(firstChunkTime || bufferStart) - geminiCallStart}ms | Streaming: ${requestEndTime - (firstChunkTime || bufferStart)}ms`);

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

              // Append observability data if enabled
              if (observability) {
                observability.finalResponseLength = bytesSent;
                observability.totalDuration = Date.now() - observability.requestStartTime;
                const observabilityJson = JSON.stringify({
                  contextStack: observability.contextStack,
                  toolCalls: observability.toolCalls,
                  chainedCalls: observability.chainedCalls,
                  totalDuration: observability.totalDuration,
                  finalResponseLength: observability.finalResponseLength
                });
                controller.enqueue(encoder.encode(`\n---OBSERVABILITY---\n${observabilityJson}`));
              }
              
              // Record global token usage if userId is available
              if (userId && accumulatedFullText) {
                const generatedTokens = countTokens(accumulatedFullText);
                UsageService.recordUsage(userId, generatedTokens)
                  .then(usage => console.log(`[Usage] Recorded ${generatedTokens} tokens for ${userId}. Total: ${usage.totalTokens}`))
                  .catch(err => console.warn(`[Usage] Failed to record usage for ${userId}:`, err));
              }

              // Trigger background summarization for this turn (tool memory)
              toolMemorySummarizer.enqueueSummarization(userId || 'anonymous-text-session')
                .catch(err => console.warn(`[ToolMemory] Summarization failed:`, err));

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
    // Note: Observability data collected up to error point is lost in error cases
    // This is acceptable as errors are rare and observability is primarily for successful requests
    return handleServerError(error);
  }
}
