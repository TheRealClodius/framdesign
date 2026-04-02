/**
 * FRAM Voice Server - Google Gemini Live API Integration
 * 
 * VERIFICATION STATUS (Jan 2026):
 * - The Google Gemini Live API uses a WebSocket-based REST endpoint called "BidiGenerateContent"
 * - The @google/genai SDK method names (connectToLiveSession) need verification
 * - If SDK methods don't exist, may need to use REST API directly:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
 * - Stable model: gemini-live-2.5-flash-native-audio (released Dec 12, 2025)
 * - Preview model: gemini-3-flash-preview (released Dec 17, 2025)
 * 
 * REFERENCE:
 * - Live API Docs: https://ai.google.dev/api/live
 * - Model Versions: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions
 */

import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { createServer } from 'http';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { encoding_for_model } from 'tiktoken';
import { buildSystemInstruction } from './config.js';
import { toolRegistry } from '../tools/_core/registry.js';
import { createStateController } from '../tools/_core/state-controller.js';
import { GeminiLiveTransport } from './providers/gemini-live-transport.js';
import { assertLiveApiAvailable, assertLiveSession } from './live-session-guard.js';
import { ErrorType } from '../tools/_core/error-types.js';
import { retryWithBackoff } from '../tools/_core/retry-handler.js';
import { loopDetector } from '../tools/_core/loop-detector.js';
import { UsageService } from '../lib/services/usage-service.ts';
import { checkRateLimit } from '../lib/services/rate-limit-service.ts';
import { RATE_LIMIT_CONFIG } from '../lib/constants.ts';
import { getClientIpFromNodeHeaders, resolveBudgetKeyFromParts } from '../lib/utils/budget-key.ts';
import { readEnvInt } from '../lib/server-env.ts';
import { toolMemoryStore } from '../tools/_core/tool-memory-store.js';
import { toolMemoryDedup } from '../tools/_core/tool-memory-dedup.js';
import { hashArgs } from '../tools/_core/utils/hash-args.js';
import { estimateTokensForObject } from '../tools/_core/utils/estimate-tokens.js';
import {
  startSession,
  endSession,
  recordSessionToolCall,
  startNewTurn,
  recordResponseMetrics,
  setContextInitTokens
} from '../tools/_core/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from voice-server/.env regardless of cwd
config({ path: join(__dirname, '.env') });

// Load tool registry at startup
let geminiToolSchemas = [];
try {
  console.log('[STARTUP] Loading tool registry...');
  await toolRegistry.load();
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[STARTUP] Development mode detected (NODE_ENV=development)');
    console.log('[STARTUP] Enabling tool registry hot-reload watch...');
    toolRegistry.watch(() => {
      // Update the local reference to schemas when registry reloads
      geminiToolSchemas = toolRegistry.getProviderSchemas('geminiNative', 'voice');
      console.log(`[TOOLS] ✓ Hot-reloaded ${geminiToolSchemas.length} tool schemas for future sessions`);
    });
  } else {
    toolRegistry.lock(); // Lock registry in production
  }
  
  // Get Gemini Native provider schemas for session config (loaded from registry)
  geminiToolSchemas = toolRegistry.getProviderSchemas('geminiNative', 'voice');
  console.log(`[STARTUP] ✓ Tool registry loaded successfully`);
} catch (error) {
  console.error('[STARTUP] ✗ Failed to load tool registry:', error);
  console.error('[STARTUP] Error stack:', error.stack);
  console.error('[STARTUP] Current working directory:', process.cwd());
  console.error('[STARTUP] __dirname equivalent:', import.meta.url);
  process.exit(1);
}

console.log(`[TOOLS] ✓ Initialized with ${geminiToolSchemas.length} tool schemas for Gemini Live`);

if (process.env.DEBUG === 'true') {
  geminiToolSchemas.forEach((schema, i) => {
    console.log(`  [${i + 1}] ${schema.name}: ${schema.description?.slice(0, 60)}...`);
  });
  console.log(`[TOOLS] Full schemas:`, JSON.stringify(geminiToolSchemas, null, 2));
}

// Load environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERTEXAI_PROJECT = process.env.VERTEXAI_PROJECT;
const VERTEXAI_LOCATION = process.env.VERTEXAI_LOCATION || 'us-central1';
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS; // Service account JSON path
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
const DEFAULT_GEMINI_VOICE_MODEL = 'gemini-3.1-flash-live-preview';

// Prefer AI Studio (API key) for Live API — Gemini 3.1 Live models are available on AI Studio.
// Fall back to Vertex AI only if no API key is set but Vertex AI project is configured.
const USE_VERTEX_AI = !GEMINI_API_KEY && !!VERTEXAI_PROJECT;

// Log environment status for debugging
console.log('[ENV] Environment variables check:');
console.log(`[ENV]   GEMINI_API_KEY: ${GEMINI_API_KEY ? 'SET' : 'NOT SET'} (Primary: AI Studio)`);
console.log(`[ENV]   VERTEXAI_PROJECT: ${VERTEXAI_PROJECT || 'NOT SET'} (Fallback: Vertex AI)`);
console.log(`[ENV]   VERTEXAI_LOCATION: ${VERTEXAI_LOCATION}`);
console.log(`[ENV]   GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS ? 'SET' : 'NOT SET'} (Vertex AI Auth)`);
console.log(`[ENV]   PORT: ${PORT}`);
console.log(`[ENV]   ALLOWED_ORIGINS: ${ALLOWED_ORIGINS.join(', ')}`);

if (!GEMINI_API_KEY && !VERTEXAI_PROJECT) {
  console.error('[ERROR] Missing required credentials!');
  console.error('[ERROR] Set GEMINI_API_KEY (recommended) or VERTEXAI_PROJECT');
  console.error('[ERROR] Server will exit. Please set environment variables in Railway dashboard.');
  process.exit(1);
}

if (USE_VERTEX_AI) {
  console.log(`[STARTUP] Using Vertex AI (Project: ${VERTEXAI_PROJECT}, Location: ${VERTEXAI_LOCATION}) for Main Agent`);
  console.log('[STARTUP] Note: Set GEMINI_API_KEY to use AI Studio instead (recommended for Live API models)');

  if (GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      // Try to parse as JSON (Railway environment variable stores JSON as string)
      const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
      const tempFile = join(tmpdir(), `gcp-credentials-${Date.now()}.json`);
      writeFileSync(tempFile, GOOGLE_APPLICATION_CREDENTIALS);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFile;
      console.log('[STARTUP] ✓ Using service account from GOOGLE_APPLICATION_CREDENTIALS (JSON string)');
      console.log(`[STARTUP]   Service account: ${credentials.client_email}`);
    } catch {
      // Not JSON - it's a file path, which is the standard usage
      console.log('[STARTUP] ✓ Using service account credentials file');
      console.log(`[STARTUP]   Path: ${GOOGLE_APPLICATION_CREDENTIALS}`);
    }
  } else {
    // No explicit credentials - use Application Default Credentials (ADC)
    // This works when: gcloud auth application-default login was run
    console.log('[STARTUP] ✓ Using Application Default Credentials (ADC)');
    console.log('[STARTUP]   Note: Run "gcloud auth application-default login" if not authenticated');
  }
} else {
  console.log('[STARTUP] Using Google AI Studio (API Key) for Main Agent + Live API');
}

// Create HTTP server for health checks
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

console.log(`Voice Server starting on port ${PORT}`);

wss.on('connection', async (ws, req) => {
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[${clientId}] Client connected`);

  // Start session tracking (NEW)
  startSession(clientId);

  // Validate origin for security
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`[${clientId}] Rejected unauthorized origin: ${origin}`);
    ws.close(1008, 'Unauthorized origin');
    endSession(clientId); // Clean up session tracking
    return;
  }

  // Session state
  let geminiSession = null;
  let sessionReady = false;  // Track if setupComplete has been received
  let sessionStarted = false; // Track whether client has been told startup succeeded
  let audioBuffer = [];  // Buffer audio chunks until session is ready
  let conversationTranscripts = { user: [], assistant: [] };
  let conversationHistory = []; // Store for context injection
  let pendingRequest = null; // Store pending user request from text agent handoff
  let currentUserId = null; // Budget key (validated client id or ip-hash) for usage tracking
  let currentTurn = 1; // Track conversation turns for loop detection (NEW)
  
  // Track last transcript text to detect and deduplicate overlapping chunks from Gemini
  // Gemini's streaming transcription can send chunks that overlap with previous chunks
  let lastTranscriptText = { user: '', assistant: '' };
  // Track asset markdown snippets from tool results for voice transcript injection
  let pendingMarkdownSnippets = [];
  // Track citations from perplexity_search tool results for voice transcript injection
  let pendingCitations = [];
  // Track whether assistant transcript text already came from modelTurn.parts for this turn.
  // If so, skip outputTranscription to avoid duplicate/conflicting chat lines.
  let assistantTranscriptSentFromModelTurn = false;

  // Initialize state controller for session
  const state = createStateController({
    mode: 'voice',
    isActive: true,
    pendingEndVoiceSession: null,
    shouldSuppressAudio: false,
    shouldSuppressTranscript: false,
    isModelGenerating: false,
    interruptionSent: false,
    audioChunkCounter: 0,
    lastAudioFingerprint: null,
    hasSentGeneratingSignal: false,
    // Counter for audio chunks during model generation - requires sustained speech for barge-in
    userAudioChunkCount: 0,
    // Whether we are intentionally buffering user audio (disabled when relying on Gemini VAD)
    awaitingUserTurn: false
  });

  // Audio buffer for storing audio chunks while awaiting user turn
  // This ensures Gemini receives all audio as a batch, preventing timing issues
  let pendingAudioBuffer = [];
  // Fallback VAD: auto-complete user turn if client signal is missed
  let userTurnTimeout = null;
  let userTurnCompletionInProgress = false;
  const USER_TURN_SILENCE_MS = 900;
  const STARTUP_TIMEOUT_MS = 15000;
  let startupTimeout = null;

  // Transport will be set when geminiSession is created
  let transport = null;

  function clearStartupTimeout() {
    if (startupTimeout) {
      clearTimeout(startupTimeout);
      startupTimeout = null;
    }
  }

  function failSessionStartup(errorMessage, details = null, closeCode = 1011) {
    clearStartupTimeout();
    sessionReady = false;
    sessionStarted = false;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: errorMessage,
        details
      }));

      // Close the browser socket so the client exits startup cleanly instead of hanging.
      ws.close(closeCode, 'Voice session startup failed');
    }

    if (geminiSession) {
      try {
        geminiSession.close();
      } catch (error) {
        console.error(`[${clientId}] Error closing Gemini session after startup failure:`, error);
      }
      geminiSession = null;
    }
  }

  // Initialize GoogleGenAI with appropriate credentials
  // Note: Don't set apiVersion for Vertex AI - the SDK handles it
  let aiConfig;
  
  if (USE_VERTEX_AI) {
    // Vertex AI configuration
    aiConfig = {
      vertexai: true,
      project: VERTEXAI_PROJECT,
      location: VERTEXAI_LOCATION
    };
    
    // Handle service account credentials if provided as JSON string
    // (Used for Railway deployment where credentials are stored as env var)
    if (GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        // Try to parse as JSON string (Railway stores JSON as string in env vars)
        const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
        aiConfig.googleAuthOptions = {
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key.replace(/\\n/g, '\n')
          }
        };
      } catch {
        // Not JSON - it's a file path, SDK will use process.env.GOOGLE_APPLICATION_CREDENTIALS
        // No additional config needed
      }
    }
    // Otherwise, SDK will use Application Default Credentials (ADC)
    // ADC uses gcloud auth or GOOGLE_APPLICATION_CREDENTIALS file path
  } else {
    // Google AI Studio — omit apiVersion so the SDK auto-selects the correct
    // version for each endpoint (v1alpha for Live API, v1beta for standard).
    aiConfig = {
      apiKey: GEMINI_API_KEY
    };
  }
  
  const ai = new GoogleGenAI(aiConfig);

  // Helper function to send audio to Gemini
  let audioSendCount = 0;
  function sendAudioToGemini(base64Audio) {
    if (!geminiSession) {
      console.warn(`[${clientId}] Cannot send audio - no session`);
      return false;
    }
    
    // Reduce log verbosity - only log every 50th chunk
    audioSendCount++;
    if (audioSendCount === 1 || audioSendCount % 50 === 0) {
      console.log(`[${clientId}] Audio → Gemini (chunk #${audioSendCount}, ${base64Audio.length} chars)`);
    }
    
    try {
      geminiSession.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
      return true;
    } catch (error) {
      console.error(`[${clientId}] Error in sendRealtimeInput:`, error);
      return false;
    }
  }

  function clearUserTurnTimeout() {
    if (userTurnTimeout) {
      clearTimeout(userTurnTimeout);
      userTurnTimeout = null;
    }
  }

  function sendTextToGemini(text) {
    if (!geminiSession) {
      console.warn(`[${clientId}] Cannot send text - no session`);
      return false;
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      console.warn(`[${clientId}] Cannot send empty text to Gemini`);
      return false;
    }

    try {
      geminiSession.sendRealtimeInput({ text });
      console.log(`[${clientId}] Text → Gemini (${text.length} chars)`);
      return true;
    } catch (error) {
      console.error(`[${clientId}] Error sending text to Gemini:`, error);
      return false;
    }
  }

  // Helper function to deduplicate overlapping transcript chunks
  // Gemini's streaming transcription can send chunks that overlap with previous chunks
  // e.g., Previous: "linkedin.com/in/user-123456/" New: "123456/" -> should only add nothing or minimal
  function deduplicateTranscript(previousText, newText, role) {
    if (!previousText || !newText) return newText;
    
    // Normalize whitespace for comparison
    const prevNormalized = previousText.trim();
    const newNormalized = newText.trim();
    
    // If the new text is entirely contained in the previous text, it's a duplicate
    if (prevNormalized.endsWith(newNormalized)) {
      console.log(`[TRANSCRIPT-DEDUP] ${role}: Complete duplicate detected, skipping`);
      return null;
    }
    
    // Check for overlapping suffix/prefix
    // Look for the longest overlap between end of previous and start of new
    let maxOverlap = Math.min(prevNormalized.length, newNormalized.length);
    let overlapLength = 0;
    
    for (let i = 1; i <= maxOverlap; i++) {
      const prevSuffix = prevNormalized.slice(-i);
      const newPrefix = newNormalized.slice(0, i);
      
      if (prevSuffix === newPrefix) {
        overlapLength = i;
      }
    }
    
    if (overlapLength > 0) {
      // There's an overlap - return only the non-overlapping portion
      const deduplicated = newNormalized.slice(overlapLength);
      console.log(`[TRANSCRIPT-DEDUP] ${role}: Overlap detected (${overlapLength} chars), original: "${newNormalized.substring(0, 30)}...", deduplicated: "${deduplicated.substring(0, 30)}..."`);
      
      // If after deduplication there's nothing left, return null
      if (!deduplicated.trim()) {
        return null;
      }
      
      return deduplicated;
    }
    
    // No overlap detected, return original
    return newText;
  }

  function extractMarkdownFromToolResult(result) {
    const snippets = [];
    if (!result || !result.ok || !result.data) return snippets;

    const data = result.data;
    if (typeof data.markdown === 'string' && data.markdown.trim()) {
      snippets.push(data.markdown.trim());
    }

    if (Array.isArray(data.results)) {
      for (const entry of data.results) {
        const markdown = entry?.metadata?.markdown;
        if (typeof markdown === 'string' && markdown.trim()) {
          snippets.push(markdown.trim());
        }
      }
    }

    return snippets;
  }

  /**
   * Clean tool response data before sending to Gemini.
   * Removes internal metadata fields (_timing, _imageData, _allAssets, _diagnostics)
   * and truncates large content to keep voice responses fast.
   * Mirrors the cleaning done in the text agent (app/api/chat/route.ts).
   */
  function cleanToolResultForGemini(result, toolName) {
    if (!result || !result.ok || !result.data) return result;

    // Deep clone to avoid mutating the original (used by tool memory, markdown extraction, etc.)
    const cleaned = JSON.parse(JSON.stringify(result));
    const data = cleaned.data;

    // Remove internal metadata fields that confuse the model
    delete data._imageData;
    delete data._timing;
    delete data._allAssets;
    delete data._diagnostics;

    // Clean nested results (kb_search returns an array of results)
    if (Array.isArray(data.results)) {
      data.results.forEach(r => {
        if (r.metadata) {
          delete r.metadata._distance;
          delete r.metadata.vector;
        }
      });
    }

    // Truncate large kb_get content for voice (spoken responses don't need full text)
    if (toolName === 'kb_get' && data.content) {
      const maxLength = 1500; // ~375 tokens — tighter for voice latency
      if (data.content.length > maxLength) {
        const originalLength = data.content.length;
        data.content = data.content.substring(0, maxLength) + '\n\n... [Content truncated. Key details above.]';
        data._truncated = true;
        console.log(`[voice] Truncated kb_get content from ${originalLength} to ${maxLength} chars`);
      }
    }

    return cleaned;
  }

  function extractCitationsFromToolResult(result) {
    const citations = [];
    if (!result || !result.ok || !result.data) return citations;

    const data = result.data;
    // perplexity_search returns citations in data.citations array
    if (Array.isArray(data.citations) && data.citations.length > 0) {
      for (const citation of data.citations) {
        // Citations can be strings (URLs) or objects with url/title
        if (typeof citation === 'string') {
          citations.push({ url: citation });
        } else if (citation && typeof citation === 'object') {
          citations.push({
            url: citation.url || citation.link || null,
            title: citation.title || citation.name || null
          });
        }
      }
    }

    return citations;
  }

  async function finalizeUserTurn(source) {
    if (userTurnCompletionInProgress) {
      console.log(`[${clientId}] User turn completion already in progress, skipping (${source})`);
      return;
    }
    userTurnCompletionInProgress = true;
    clearUserTurnTimeout();

    // Clear awaiting flag so new audio can flow while Gemini responds
    state.set('awaitingUserTurn', false);

    try {
      if (!geminiSession) {
        console.error(`[${clientId}] Cannot finalize user turn - geminiSession is null`);
        return;
      }

      if (pendingAudioBuffer.length === 0) {
        console.log(`[${clientId}] No buffered audio for user turn (${source}) - skipping Gemini turnComplete`);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'turn_complete' }));
        }
        return;
      }

      console.log(`[${clientId}] Finalizing user turn (${source}) with ${pendingAudioBuffer.length} buffered chunks`);
      const chunksToSend = pendingAudioBuffer;
      pendingAudioBuffer = [];

      for (const audioChunk of chunksToSend) {
        sendAudioToGemini(audioChunk);
      }

      // Block audio during model generation
      state.set('isModelGenerating', true);
      state.set('userAudioChunkCount', 0); // Reset barge-in counter
      console.log(`[${clientId}] Setting isModelGenerating=true (audio blocked until barge-in threshold)`);

      // Gemini 3.1 Live expects realtime audio streams to be flushed via audioStreamEnd.
      await geminiSession.sendRealtimeInput({ audioStreamEnd: true });
      console.log(`[${clientId}] ✓ Sent audioStreamEnd=true to Gemini`);
    } catch (error) {
      console.error(`[${clientId}] Error finalizing user turn (${source}):`, error);
      // Reset state on error to avoid deadlock
      state.set('isModelGenerating', false);
    } finally {
      userTurnCompletionInProgress = false;
    }
  }

  // Helper function to handle messages from Gemini
  async function handleGeminiMessage(clientId, message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Setup complete
    if (message.setupComplete) {
      console.log(`[${clientId}] Setup complete - session ID: ${message.setupComplete.sessionId}`);
      
      // DON'T set sessionReady yet - we need to inject history first
      // Otherwise new audio chunks will bypass the buffer and reach Gemini before context

      // CRITICAL: Inject history FIRST, then set sessionReady, then flush audio
      const historyDelay = 50; // Small delay to ensure session is stable
      
      const injectHistoryAndFlush = () => {
        if (!geminiSession) return;
        
        // 1. Inject history if present
        const toolMemorySessionId = currentUserId || clientId;
        const pastToolCalls = toolMemoryStore.queryToolCalls(toolMemorySessionId, { timeRange: 'all' });
        let toolMemoryContext = '';
        
        if (pastToolCalls.length > 0) {
          const summaryLines = pastToolCalls.map(call => 
            `- ID: ${call.id} | Tool: ${call.toolId} | Turn: ${call.turn || '?'}${call.summary ? ` | Summary: ${call.summary}` : ''}`
          ).reverse(); // Oldest first
          
          toolMemoryContext = `PAST TOOL EXECUTIONS IN THIS SESSION:\n${summaryLines.join('\n')}\n\nUse 'query_tool_memory' with a specific ID to retrieve the full response if needed.`;
        }

        if (conversationHistory.length > 0 || toolMemoryContext) {
          try {
            // Add session boundary marker BEFORE history
            const contextParts = [];
            if (toolMemoryContext) {
              contextParts.push({ text: `[SYSTEM CONTEXT: ${toolMemoryContext}]` });
            }
            contextParts.push({ text: '[--- NEW VOICE SESSION STARTED ---]\n\nPrevious messages are for context only. Only respond to commands given in THIS voice session, not historical ones.' });

            const sessionBoundaryMarker = {
              role: 'user',
              parts: contextParts
            };
            
            const historyTurns = [
              sessionBoundaryMarker,
              ...(conversationHistory.length > 0 ? [{ role: 'model', parts: [{ text: 'ACKNOWLEDGED.' }] }] : []),
              ...conversationHistory.map(turn => ({
                role: turn.role,
                parts: turn.parts
              }))
            ];

            const buildTextFromParts = (parts) => (parts || [])
              .map((part) => typeof part?.text === 'string' ? part.text : '')
              .filter(Boolean)
              .join('\n\n')
              .trim();

            let realtimePrompt = null;

            if (pendingRequest) {
              realtimePrompt = `[Continue with: ${pendingRequest}]`;
            } else {
              const lastConversationTurn = conversationHistory[conversationHistory.length - 1];
              const shouldResumeLastUserTurn = lastConversationTurn?.role === 'user';
              if (shouldResumeLastUserTurn) {
                const extractedText = buildTextFromParts(lastConversationTurn.parts);
                if (extractedText) {
                  historyTurns.pop();
                  realtimePrompt = extractedText;
                }
              }
            }

            // Gemini 3.1 Live only supports sendClientContent for initial history seeding.
            geminiSession.sendClientContent({
              turns: historyTurns,
              turnComplete: true
            });

            const willRespond = !!realtimePrompt;
            console.log(`[${clientId}] History seeded: ${historyTurns.length} turns, pendingRequest=${!!pendingRequest}, willRespond=${willRespond}`);

            if (realtimePrompt) {
              state.set('isModelGenerating', true);
              console.log(`[${clientId}] Pre-emptively setting isModelGenerating (realtime prompt after history seed)`);
              sendTextToGemini(realtimePrompt);
            }
          } catch (error) {
            console.error(`[${clientId}] Error sending conversation history:`, error);
          }
        } else if (pendingRequest) {
          // No history but there's a pending request - send it as realtime text.
          try {
            state.set('isModelGenerating', true);
            console.log(`[${clientId}] Pre-emptively setting isModelGenerating (pending request via realtime text)`);

            sendTextToGemini(`[Continue with: ${pendingRequest}]`);
            console.log(`[${clientId}] 📌 No history, sent pending request via realtime text: "${pendingRequest}"`);
          } catch (error) {
            console.error(`[${clientId}] Error sending pending request:`, error);
            state.set('isModelGenerating', false);
          }
        }
        
        // 2. NOW set sessionReady - new audio will go directly to Gemini
        sessionReady = true;
        sessionStarted = true;
        clearStartupTimeout();
        console.log(`[${clientId}] Session now ready for audio`);

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'started',
            sessionId: clientId
          }));
        }
        
        // 3. Flush any buffered audio (collected while waiting for history)
        if (audioBuffer.length > 0) {
          console.log(`[${clientId}] Flushing ${audioBuffer.length} buffered audio chunks`);
          const chunksToFlush = [...audioBuffer];
          audioBuffer = [];
          
          chunksToFlush.forEach((chunk, index) => {
            setTimeout(() => {
              if (geminiSession) {
                sendAudioToGemini(chunk);
              }
            }, index * 10);
          });
        }
      };
      
      setTimeout(injectHistoryAndFlush, historyDelay);
      return;
    }

    // CRITICAL: Process tool calls FIRST before serverContent
    // This ensures suppression flags are set before we process transcripts
    // (toolCall and serverContent can arrive in the same message)
    // Check both toolCall (singular) and toolCalls (plural) for SDK compatibility
    const toolCallData =
      message.toolCall ||
      message.toolCalls ||
      message.serverContent?.toolCall ||
      message.bidiGenerateContentToolCall?.toolCall ||
      message.bidiGenerateContentToolCall;
    if (toolCallData && transport) {
      console.log(`[${clientId}] Tool call requested:`, JSON.stringify(toolCallData, null, 2));

      // Parse tool calls via transport
      const toolCalls = transport.receiveToolCalls(message);
      
      // Signal client that tool execution is starting (for thinking sound feedback)
      if (toolCalls.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'tool_call_started', 
          toolCount: toolCalls.length 
        }));
        console.log(`[${clientId}] ✓ Sent tool_call_started signal (${toolCalls.length} tools)`);
      }
      
      // Note: We don't pause client here - agent can acknowledge tool calls while they execute
      // (e.g., "just a sec, let me search that for you")

      // Voice mode budget tracking
      let retrievalCallsThisTurn = 0;
      const VOICE_BUDGET = {
        MAX_RETRIEVAL_CALLS_PER_TURN: 2,
        MAX_TOTAL_CALLS_PER_TURN: 3
      };

      // Execute tools sequentially (Gemini expects results in order)
      // But send results immediately as they complete for faster response
      for (let i = 0; i < toolCalls.length; i++) {
        const call = toolCalls[i];
        // Validate tool call structure
        if (!call.name) {
          console.error(`[${clientId}] Invalid tool call: missing name`, JSON.stringify(call, null, 2));
          continue;
        }

        // Get tool metadata for policy enforcement
        const toolMetadata = toolRegistry.getToolMetadata(call.name);

        if (!toolMetadata) {
          // Tool not found - send error via transport
          console.error(`[${clientId}] Unknown tool: ${call.name}`);
          await transport.sendToolResult({
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: {
                type: ErrorType.NOT_FOUND,
                message: `Unknown tool: ${call.name}`,
                retryable: false
              },
              intents: [],
              meta: {
                toolId: call.name,
                duration: 0,
                responseSchemaVersion: '1.0.0'
              }
            }
          });
          continue;
        }

        // POLICY: Check mode restrictions
        const currentMode = state.get('mode');
        if (!toolMetadata.allowedModes.includes(currentMode)) {
          console.warn(`[${clientId}] Tool ${call.name} not allowed in ${currentMode} mode`);
          await transport.sendToolResult({
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: {
                type: ErrorType.MODE_RESTRICTED,
                message: `Tool ${call.name} not available in ${currentMode} mode`,
                retryable: false
              },
              intents: [],
              meta: {
                toolId: call.name,
                duration: 0,
                responseSchemaVersion: '1.0.0'
              }
            }
          });
          continue;
        }

        // POLICY: Enforce voice retrieval budget (HARD GATE)
        let isRetrievalCall = toolMetadata.category === 'retrieval';

        if (call.name === 'run_tool' && call.args?.name) {
          const targetToolMeta = toolRegistry.getToolMetadata(call.args.name);
          if (targetToolMeta?.category === 'retrieval') {
            isRetrievalCall = true;
          }
        }

        if (isRetrievalCall) {
          retrievalCallsThisTurn++;
          if (retrievalCallsThisTurn > VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN) {
            console.warn(`[${clientId}] Retrieval budget exceeded (${retrievalCallsThisTurn}/${VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN})`);
            await transport.sendToolResult({
              id: call.id,
              name: call.name,
              result: {
                ok: false,
                error: {
                  type: ErrorType.BUDGET_EXCEEDED,
                  message: `Voice retrieval budget exceeded (max ${VOICE_BUDGET.MAX_RETRIEVAL_CALLS_PER_TURN} per turn)`,
                  retryable: false
                },
                intents: [],
                meta: {
                  toolId: call.name,
                  duration: 0,
                  responseSchemaVersion: '1.0.0'
                }
              }
            });
            continue;
          }
        }

        // Check for loops before execution (NEW)
        let loopCheckKey = call.name;
        let loopCheckArgs = call.args;
        if (call.name === 'run_tool' && call.args?.name) {
          loopCheckKey = `run_tool:${call.args.name}`;
          loopCheckArgs = call.args.args;
        }

        const loopCheck = loopDetector.detectLoop(
          clientId,
          currentTurn,
          loopCheckKey,
          loopCheckArgs
        );

        if (loopCheck.detected) {
          console.warn(`[${clientId}] Loop detected: ${loopCheck.message}`);

          // Return feedback to agent instead of executing
          const feedbackResult = {
            ok: false,
            error: {
              type: 'LOOP_DETECTED',
              message: loopCheck.message,
              retryable: false,
              details: {
                loopType: loopCheck.type,
                count: loopCheck.count
              }
            },
            intents: [],
            meta: {
              toolId: call.name,
              duration: 0,
              responseSchemaVersion: '1.0.0'
            }
          };

          await transport.sendToolResult({
            id: call.id,
            name: call.name,
            result: feedbackResult
          });

          continue; // Skip execution
        }

        // Build execution context
        const executionContext = {
          clientId,
          ws,
          geminiSession,
          args: call.args || {},
          capabilities: { voice: true, messaging: false }, // Voice mode capabilities
          session: {
            isActive: state.get('isActive'),
            toolsVersion: toolRegistry.getVersion(),
            state: state.getSnapshot()
          }
        };

        // Pre-execution deduplication check (tool memory)
        const dedupCheck = toolMemoryDedup.checkForDuplicate(
          clientId,
          call.name,
          call.args || {}
        );

        let result;
        let duration;
        const startTime = Date.now();

        if (dedupCheck.isDuplicate) {
          console.log(`[${clientId}] [ToolMemory] Reusing cached result for ${call.name} (call: ${dedupCheck.originalCallId})`);
          result = dedupCheck.cachedResult;
          duration = Date.now() - startTime; // Should be ~0ms (instant)
        } else {
          // Execute tool through registry with retry logic (text mode only)
          console.log(`[${clientId}] Executing tool: ${call.name} (mode: ${currentMode})`);
          result = await retryWithBackoff(
            () => {
              console.log(`[${clientId}] Calling executeTool for ${call.name}...`);
              return toolRegistry.executeTool(call.name, executionContext);
            },
            {
              mode: currentMode,
              maxRetries: 3,
              toolId: call.name,
              toolMetadata: toolMetadata,
              clientId: clientId
            }
          );
          duration = Date.now() - startTime;
          
          // Enhanced timing log for slow tool calls
          if (duration > 500) {
            console.log(`[${clientId}] ⏱️ SLOW TOOL CALL: ${call.name} took ${duration}ms`);
            if (result.meta?._timing) {
              console.log(`[${clientId}] ⏱️ Breakdown: ${JSON.stringify(result.meta._timing)}`);
            }
          }
        }

        console.log(`[${clientId}] Tool ${call.name} completed in ${duration}ms (ok: ${result.ok})`);

        // Record response metrics (NEW)
        if (result.ok && result.data) {
          recordResponseMetrics(call.name, result.data);
        }

        // Capture asset markdown snippets for voice transcript injection
        const markdownSnippets = extractMarkdownFromToolResult(result);
        if (markdownSnippets.length > 0) {
          pendingMarkdownSnippets.push(...markdownSnippets);
          console.log(`[${clientId}] Collected ${markdownSnippets.length} asset markdown snippet(s) from ${call.name}`);
        }

        // Capture citations from perplexity_search for voice transcript injection
        if (call.name === 'perplexity_search') {
          const citations = extractCitationsFromToolResult(result);
          if (citations.length > 0) {
            pendingCitations.push(...citations);
            console.log(`[${clientId}] Collected ${citations.length} citation(s) from perplexity_search`);
          }
        }

        // Record session tool call (NEW)
        recordSessionToolCall(clientId, call.name, call.args, duration, result.ok);

        // Record in tool memory store (NEW - Tool Memory)
        if (!dedupCheck.isDuplicate) {
          const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const toolMemorySessionId = currentUserId || clientId;
          toolMemoryStore.recordToolCall(toolMemorySessionId, {
            id: callId,
            toolId: call.name,
            args: call.args || {},
            argsHash: hashArgs(call.args || {}),
            timestamp: Date.now(),
            turn: currentTurn,
            duration: duration,
            fullResponse: result,
            summary: null, // Will be generated async
            ok: result.ok,
            error: result.ok ? null : result.error,
            tokens: estimateTokensForObject(result)
          });
        }

        // Record call for loop detection (NEW)
        const recordKey = loopCheckKey;
        const recordArgs = loopCheckArgs;
        loopDetector.recordCall(clientId, currentTurn, recordKey, recordArgs, result);

        // Structured audit logging
        console.log(JSON.stringify({
          event: 'tool_execution',
          toolId: call.name,
          toolVersion: toolMetadata.version,
          registryVersion: toolRegistry.getVersion(),
          duration,
          ok: result.ok,
          category: toolMetadata.category,
          sessionId: clientId,
          mode: currentMode
        }));

        // POLICY: Warn if latency budget exceeded (SOFT LIMIT)
        if (duration > toolMetadata.latencyBudgetMs) {
          console.warn(`[${clientId}] Tool ${call.name} exceeded latency budget: ${duration}ms > ${toolMetadata.latencyBudgetMs}ms`);
        }

        // Apply intents if successful
        if (result.ok && result.intents) {
          for (const intent of result.intents) {
            // For END_VOICE_SESSION, store full tool data along with intent
            if (intent.type === 'END_VOICE_SESSION' && result.data) {
              state.set('pendingEndVoiceSession', {
                after: intent.after || 'current_turn',
                reason: result.data.reason || 'user_requested',
                closingMessage: result.data.finalMessage || null,
                textResponse: result.data.textResponse || null
              });
              console.log(`[${clientId}] Applied intent: ${intent.type} (after: ${intent.after || 'current_turn'})`);
            } else {
              state.applyIntent(intent);
              console.log(`[${clientId}] Applied intent:`, intent.type);
            }
          }
        }

        // Clean result before sending to Gemini (remove internal metadata, truncate large content)
        const cleanedResult = cleanToolResultForGemini(result, call.name);

        // Send cleaned result via transport
        await transport.sendToolResult({
          id: call.id,
          name: call.name,
          result: cleanedResult
        });
        
        // After sending the last tool result, notify the client for UI feedback
        // NOTE: We do NOT send turnComplete here - sendToolResponse already signals Gemini to continue
        // Sending turnComplete after tool results was causing duplicate responses
        const isLastTool = i === toolCalls.length - 1;
        if (isLastTool) {
          console.log(`[${clientId}] All tool results sent (${toolCalls.length} tools) - Gemini will auto-continue after sendToolResponse`);
          try {
            // Signal client that tool execution is complete (for UI feedback)
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'tools_complete', toolCount: toolCalls.length }));
              console.log(`[${clientId}] ✓ Sent tools_complete signal to client`);
            }
            // NOTE: Removed sendClientContent({ turnComplete: true }) - it was causing Gemini
            // to think a new user turn ended and respond multiple times with similar content
          } catch (error) {
            console.error(`[${clientId}] Error sending tools_complete to client:`, error);
          }
        } else {
          console.log(`[${clientId}] Tool ${call.name} result sent (${i + 1}/${toolCalls.length})`);
        }
      }
    }

    // Server content (audio/text responses)
    // IMPORTANT: Processed AFTER toolCall so suppression flags are set first
    if (message.serverContent) {
      const content = message.serverContent;
      
      // Track if model is generating
      if (content.modelTurn?.parts?.length > 0) {
        state.set('isModelGenerating', true);
        state.set('userAudioChunkCount', 0); // Reset audio chunk counter for barge-in detection
        state.set('interruptionSent', false); // Reset interruption flag for new model turn
        state.set('awaitingUserTurn', false); // Reset - model is now generating
        pendingAudioBuffer = []; // Clear any stale buffered audio
        state.set('shouldSuppressAudio', false); // Reset audio suppression for new model turn
        state.set('shouldSuppressTranscript', false); // Reset transcript suppression for new model turn
        // Don't reset audioChunkCounter or lastAudioFingerprint here - keep them to track across the whole turn
        
        // Optional optimization: Send generation signal to client
        if (!state.get('hasSentGeneratingSignal')) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'model_generating' }));
            state.set('hasSentGeneratingSignal', true);
          }
        }
      }
      
      // Log full serverContent for debugging
      console.log(`[${clientId}] ServerContent received:`, JSON.stringify({
        hasModelTurn: !!content.modelTurn,
        modelTurnPartsCount: content.modelTurn?.parts?.length || 0,
        turnComplete: content.turnComplete,
        generationComplete: content.generationComplete,
        interrupted: content.interrupted,
        hasInputTranscription: !!content.inputTranscription?.text,
        hasOutputTranscription: !!content.outputTranscription?.text,
        inputTranscriptionPreview: content.inputTranscription?.text?.substring(0, 50) || null,
        outputTranscriptionPreview: content.outputTranscription?.text?.substring(0, 50) || null
      }));
      
      if (content.modelTurn?.parts) {
        console.log(`[${clientId}] modelTurn has ${content.modelTurn.parts.length} parts`);
        content.modelTurn.parts.forEach((part, idx) => {
          console.log(`[${clientId}] Part ${idx}: hasInlineData=${!!part.inlineData}, hasText=${!!part.text}, mimeType=${part.inlineData?.mimeType || 'N/A'}`);
          
          // Audio output
          if (part.inlineData) {
            const audioSize = part.inlineData.data?.length || 0;
            const audioData = part.inlineData.data;
            
            // Create a fingerprint of the audio chunk to detect duplicates
            // Use first 100 chars + size as a simple fingerprint
            const fingerprint = audioData ? `${audioData.substring(0, 100)}_${audioSize}` : null;
            
            // Check if this is a duplicate of the last audio chunk
            const isDuplicate = fingerprint && fingerprint === state.get('lastAudioFingerprint');
            
            if (isDuplicate) {
              console.log(`[${clientId}] 🚫 DUPLICATE AUDIO DETECTED! Blocking duplicate chunk (${audioSize} chars) - same as previous chunk`);
            } else if (state.get('shouldSuppressAudio')) {
              console.log(`[${clientId}] ⚠️ AUDIO SUPPRESSED (${audioSize} chars) - end_voice_session tool was called, preventing duplicate acknowledgement`);
            } else {
              const currentCounter = state.get('audioChunkCounter') + 1;
              state.set('audioChunkCounter', currentCounter);
              state.set('lastAudioFingerprint', fingerprint);
              console.log(`[${clientId}] ✓ AUDIO CHUNK #${currentCounter} RECEIVED! Sending to client (${audioSize} chars base64, ~${Math.round(audioSize * 3 / 4)} bytes, mimeType: ${part.inlineData.mimeType})`);
              
              // Only warn if end_voice_session is pending AND we have multiple chunks
              // Multiple chunks are normal - we only warn if there's a risk of double acknowledgement
              if (currentCounter > 1 && state.get('pendingEndVoiceSession')) {
                console.warn(`[${clientId}] ⚠️ WARNING: Multiple audio chunks detected (${audioChunkCounter} total) with pending end_voice_session. Suppression should prevent duplicates, but monitor for issues.`);
              }
              
              ws.send(JSON.stringify({
                type: 'audio',
                data: audioData // Base64 PCM24 from Gemini
              }));
            }
          }
          
          // Text output
          if (part.text) {
            const transcriptText = part.text;

            console.log(`[${clientId}] ✓ TEXT RESPONSE RECEIVED! Sending transcript: ${transcriptText.substring(0, 50)}...`);
            assistantTranscriptSentFromModelTurn = true;
            conversationTranscripts.assistant.push({
              text: transcriptText,
              timestamp: Date.now()
            });
            
            setImmediate(() => {
              // Send transcript with citations and images if available
              const message = {
                type: 'transcript',
                role: 'assistant',
                text: transcriptText
              };
              
              // Attach citations if we have any for this turn
              if (pendingCitations.length > 0) {
                message.citations = [...pendingCitations];
                console.log(`[${clientId}] Sending transcript with ${pendingCitations.length} citation(s)`);
                // Clear citations after sending (they're associated with this transcript)
                pendingCitations = [];
              }
              
              // Attach images if we have any for this turn
              if (pendingMarkdownSnippets.length > 0) {
                message.images = [...pendingMarkdownSnippets];
                console.log(`[${clientId}] Sending transcript with ${pendingMarkdownSnippets.length} image(s)`);
                // Clear images after sending (they're associated with this transcript)
                pendingMarkdownSnippets = [];
              }
              
              ws.send(JSON.stringify(message));
            });
          }
        });
      } else {
        console.log(`[${clientId}] ⚠️ ServerContent received but no modelTurn.parts found`);
      }

      // Turn complete (Gemini can signal via turnComplete or generationComplete depending on API version)
      const isTurnComplete = !!(content.turnComplete || content.generationComplete);
      if (isTurnComplete) {
        const turnCompleteReason = content.turnCompleteReason;
        const completionSignal = content.turnComplete ? 'turnComplete' : 'generationComplete';
        const audioChunksThisTurn = state.get('audioChunkCounter');
        console.log(`[${clientId}] Turn complete via ${completionSignal} (sent ${audioChunksThisTurn} audio chunks this turn)${turnCompleteReason ? `, reason: ${turnCompleteReason}` : ''}`);

        // Notify client that the model finished its turn so mic can resume
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'turn_complete' }));
        }
        state.set('hasSentGeneratingSignal', false);


        // Start new turn for loop detection and metrics (NEW)
        currentTurn++;
        startNewTurn(clientId);
        console.log(`[${clientId}] Started turn ${currentTurn}`);

        // Handle malformed function calls - this happens when the model tries to call a tool but the call is invalid
        if (turnCompleteReason === 'MALFORMED_FUNCTION_CALL') {
          console.error(`[${clientId}] ⚠️ MALFORMED_FUNCTION_CALL detected! Model tried to call a function but the call was invalid.`);
          console.error(`[${clientId}] Full message:`, JSON.stringify(message, null, 2));
          
          // Try to recover by sending an empty tool response to unblock the model
          // This allows the conversation to continue even if the function call was malformed
          try {
            if (geminiSession) {
              // Send a generic error response to unblock the model
              // We'll try to send responses for both possible tools to cover all cases
              geminiSession.sendToolResponse({
                functionResponses: [
                  {
                    name: 'end_voice_session',
                    response: {
                      error: 'Function call was malformed. Please try again.'
                    }
                  }
                ]
              });
              console.log(`[${clientId}] Sent recovery tool response to unblock model after malformed function call`);
            }
          } catch (error) {
            console.error(`[${clientId}] Error sending recovery tool response:`, error);
          }
          
          // Reset state to allow conversation to continue
          state.set('shouldSuppressAudio', false);
          state.set('shouldSuppressTranscript', false);
          state.set('pendingEndVoiceSession', null);
        }
        
        state.set('isModelGenerating', false);
        state.set('interruptionSent', false);
        state.set('userAudioChunkCount', 0); // Reset barge-in counter
        state.set('audioChunkCounter', 0); // Reset for next turn
        state.set('lastAudioFingerprint', null); // Reset for next turn
        
        // Reset transcript deduplication tracking for next turn
        // This prevents cross-turn deduplication from incorrectly filtering valid new transcripts
        lastTranscriptText = { user: '', assistant: '' };
        assistantTranscriptSentFromModelTurn = false;
        pendingMarkdownSnippets = [];
        pendingCitations = []; // Clear citations for new turn
        
        // If end_voice_session tool was called, now is the time to send it (after all audio is generated)
        const pendingEndVoiceSession = state.get('pendingEndVoiceSession');
        if (pendingEndVoiceSession) {
          console.log(`[${clientId}] Turn complete - scheduling end_voice_session with buffer for audio transmission`);
          // pendingEndVoiceSession structure: { after: 'current_turn', reason, closingMessage, textResponse }
          // Extract data from state (stored by orchestrator when applying intent)
          const reason = pendingEndVoiceSession.reason || 'user_requested';
          const closingMessage = pendingEndVoiceSession.closingMessage || pendingEndVoiceSession.finalMessage || null;
          const textResponse = pendingEndVoiceSession.textResponse || null;
          
          // Add delay to ensure audio chunks have time to:
          // 1. Be transmitted over WebSocket to client
          // 2. Be queued for playback on client side
          // Client will also wait for its audio queue to empty before actually ending
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'end_voice_session',
                reason: reason,
                closingMessage: closingMessage,
                textResponse: textResponse // Include optional full text response
              }));
              console.log(`[${clientId}] end_voice_session sent to client (after transmission buffer)${textResponse ? ' with text response' : ''}`);
            }
          }, 1000); // 1 second buffer for WebSocket transmission and queueing
          
          state.set('pendingEndVoiceSession', null); // Clear the pending state
          state.set('shouldSuppressAudio', false); // Reset audio suppression flag
          state.set('shouldSuppressTranscript', false); // Reset transcript suppression flag
        } else {
          // Reset audio and transcript suppression even if no pending end session (for safety)
          state.set('shouldSuppressAudio', false);
          state.set('shouldSuppressTranscript', false);
        }
      }

      // Interrupted
      if (content.interrupted) {
        const audioChunksBeforeInterrupt = state.get('audioChunkCounter');
        console.log(`[${clientId}] Response interrupted by user input (sent ${audioChunksBeforeInterrupt} audio chunks before interruption)`);
        state.set('isModelGenerating', false);
        state.set('interruptionSent', false);
        state.set('userAudioChunkCount', 0); // Reset barge-in counter
        state.set('awaitingUserTurn', false); // Reset - user is now actively speaking
        clearUserTurnTimeout();
        pendingAudioBuffer = []; // Clear any buffered audio
        state.set('shouldSuppressAudio', false); // Reset audio suppression on interruption
        state.set('shouldSuppressTranscript', false); // Reset transcript suppression on interruption
        state.set('audioChunkCounter', 0); // Reset for next turn
        state.set('lastAudioFingerprint', null); // Reset for next turn
        
        // Reset transcript deduplication tracking on interruption
        // The interrupted response is incomplete, so we need fresh deduplication for the next response
        lastTranscriptText = { user: '', assistant: '' };
        assistantTranscriptSentFromModelTurn = false;
        pendingMarkdownSnippets = [];
        pendingCitations = []; // Clear citations on interruption
        
        // Notify client to stop audio playback (if not already sent)
        if (!state.get('interruptionSent')) {
          ws.send(JSON.stringify({
            type: 'interrupted'
          }));
          state.set('interruptionSent', true);
        }
      }

      // Input transcription (user speech to text) - arrives in serverContent
      // According to Gemini Live API docs, transcripts are in serverContent.inputTranscription.text
      if (content.inputTranscription?.text) {
        const rawText = content.inputTranscription.text;
        const transcriptPreview = rawText.substring(0, 50);
        console.log(`[${clientId}] Transcript received: user - ${transcriptPreview}...`);
        console.log(`[${clientId}] ✓ INPUT TRANSCRIPTION RECEIVED: ${rawText}`);
        
        // Deduplicate overlapping chunks from Gemini's streaming transcription
        const deduplicatedText = deduplicateTranscript(lastTranscriptText.user, rawText, 'user');
        
        if (deduplicatedText) {
          // Update last transcript for future deduplication
          lastTranscriptText.user = rawText;
          
          conversationTranscripts.user.push({
            text: deduplicatedText,
            timestamp: Date.now()
          });
          
          setImmediate(() => {
            ws.send(JSON.stringify({
              type: 'transcript',
              role: 'user',
              text: deduplicatedText
            }));
          });
        } else {
          console.log(`[${clientId}] ⚠️ INPUT TRANSCRIPT SKIPPED - duplicate chunk detected`);
        }
      }

      // Output transcription (model speech to text) - arrives in serverContent
      // According to Gemini Live API docs, transcripts are in serverContent.outputTranscription.text
      if (content.outputTranscription?.text) {
        if (assistantTranscriptSentFromModelTurn) {
          console.log(`[${clientId}] Skipping outputTranscription because assistant transcript was already emitted from modelTurn.parts`);
        } else {
        const rawText = content.outputTranscription.text;
        const transcriptPreview = rawText.substring(0, 50);
        console.log(`[${clientId}] Transcript received: assistant - ${transcriptPreview}...`);
        console.log(`[${clientId}] ✓ OUTPUT TRANSCRIPTION RECEIVED: ${rawText}`);
        
        if (state.get('shouldSuppressTranscript')) {
          console.log(`[${clientId}] ⚠️ TRANSCRIPT SUPPRESSED - end_voice_session tool was called, preventing duplicate message in chat`);
        } else {
          // Deduplicate overlapping chunks from Gemini's streaming transcription
          const deduplicatedText = deduplicateTranscript(lastTranscriptText.assistant, rawText, 'assistant');
          
          if (deduplicatedText) {
            // Update last transcript for future deduplication
            lastTranscriptText.assistant = rawText;
            
            // Record token usage for assistant transcript
            if (currentUserId) {
              // Note: approximate token count for voice (could use tiktoken if needed)
              const tokens = Math.ceil(deduplicatedText.length / 4);
              UsageService.recordUsage(currentUserId, tokens)
                .catch(err => console.warn(`[${clientId}] Failed to record voice usage:`, err));
            }

            conversationTranscripts.assistant.push({
              text: deduplicatedText,
              timestamp: Date.now()
            });
            
            setImmediate(() => {
              // Send transcript with citations and images if available
              const message = {
                type: 'transcript',
                role: 'assistant',
                text: deduplicatedText
              };
              
              // Attach citations if we have any for this turn
              if (pendingCitations.length > 0) {
                message.citations = [...pendingCitations];
                console.log(`[${clientId}] Sending transcript with ${pendingCitations.length} citation(s)`);
                // Clear citations after sending (they're associated with this transcript)
                pendingCitations = [];
              }
              
              // Attach images if we have any for this turn
              if (pendingMarkdownSnippets.length > 0) {
                message.images = [...pendingMarkdownSnippets];
                console.log(`[${clientId}] Sending transcript with ${pendingMarkdownSnippets.length} image(s)`);
                // Clear images after sending (they're associated with this transcript)
                pendingMarkdownSnippets = [];
              }
              
              ws.send(JSON.stringify(message));
            });
          } else {
            console.log(`[${clientId}] ⚠️ OUTPUT TRANSCRIPT SKIPPED - duplicate chunk detected`);
          }
        }
        }
      }
    }

    // Usage metadata
    if (message.usageMetadata) {
      console.log(`[${clientId}] Token usage:`, message.usageMetadata.totalTokenCount);
    }
  }

  // Handle messages from client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`[${clientId}] Received message type: ${data.type}`);

      switch (data.type) {
        case 'start': {
          const clientIp = getClientIpFromNodeHeaders(req.headers, req.socket?.remoteAddress);
          const budgetKey = resolveBudgetKeyFromParts(
            typeof data.userId === 'string' ? data.userId : undefined,
            clientIp
          );
          console.log(`[${clientId}] Starting Gemini Live session for budget key: ${budgetKey.slice(0, 24)}...`);

          const voiceWindowMs = readEnvInt('VOICE_RATE_LIMIT_WINDOW_MS', RATE_LIMIT_CONFIG.VOICE_START_WINDOW_MS);
          const voiceMax = readEnvInt('VOICE_RATE_LIMIT_MAX', RATE_LIMIT_CONFIG.VOICE_START_MAX_PER_WINDOW);
          const voiceLimit = checkRateLimit('voice_start', budgetKey, voiceWindowMs, voiceMax);
          if (!voiceLimit.ok) {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'RATE_LIMITED',
              details: { retryAfterSec: voiceLimit.retryAfterSec, message: 'Too many voice sessions. Please wait and try again.' }
            }));
            return;
          }

          currentUserId = budgetKey;

          try {
            const isOverBudget = await UsageService.isOverBudget(budgetKey);
            if (isOverBudget) {
              console.warn(`[${clientId}] Rejecting session - over budget for ${budgetKey.slice(0, 16)}...`);
              ws.send(JSON.stringify({
                type: 'error',
                error: 'USER_BUDGET_EXHAUSTED',
                details: {
                  type: 'budget_exhausted',
                  suggestion: "We've just hit an iceberg in our conversation...metaphorically speaking that is. This is the max amount of tokens I can spend chatting with you. If you want to talk more, reach out to Andrei to upgrade you to a partner account."
                }
              }));
              return;
            }
          } catch (e) {
            console.error(`[${clientId}] Budget check failed:`, e);
            ws.send(JSON.stringify({
              type: 'error',
              error: 'BUDGET_CHECK_UNAVAILABLE',
              details: { message: 'Usage tracking is temporarily unavailable. Please try again shortly.' }
            }));
            return;
          }

          // Store conversation history for context injection
          // Filter out messages with undefined/null content to prevent "undefined" leaking into context
          conversationHistory = (data.conversationHistory || [])
            .filter(msg => msg.content != null && msg.content !== '')
            .map(msg => ({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            }));
          
          // Store pending request from text agent handoff (if any)
          pendingRequest = data.pendingRequest || null;
          
          console.log(`[${clientId}] Conversation history stored: ${conversationHistory.length} messages`);
          if (pendingRequest) {
            console.log(`[${clientId}] 📌 Pending request from text agent: "${pendingRequest}"`);
          }

          try {
            // Build system instruction with tool documentation from registry
            const systemInstruction = buildSystemInstruction(toolRegistry, 'voice');

            // Prepare session config with audio input/output enabled
            const config = {
              responseModalities: [Modality.AUDIO],
              systemInstruction: systemInstruction,
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Algenib' // Deepest voice available - ~184 Hz average pitch, gravelly tenor-baritone range
                    // Other deep voice options: 'Alnilam' (firm), 'Rasalgethi' (informative), 'Charon' (informative), 'Schedar' (even), 'Gacrux' (mature/deep female)
                  }
                }
              },
              // Enable input audio transcription - this is REQUIRED for audio input to be processed
              inputAudioTranscription: {},
              // Enable output audio transcription for debugging
              outputAudioTranscription: {},
              // Configure Voice Activity Detection (VAD) - rely on Gemini VAD (Profile A)
              realtimeInputConfig: {
                automaticActivityDetection: {
                  // Less sensitive to detecting speech start (reduces false triggers from background noise)
                  startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                  // Less likely to detect end of speech prematurely (KEY for preventing cutoffs)
                  endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                  // Short silence window for responsive turn-taking
                  silenceDurationMs: 400,
                  // Minimal prefix padding for low-latency responsiveness
                  prefixPaddingMs: 30
                },
                // Allow barge-in during model speech
                activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
                // Only include detected speech activity in the user's turn
                turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY'
              },
              historyConfig: {
                initialHistoryInClientContent: true
              },
              // Add tool support (all 5 tools from registry)
              tools: [{ functionDeclarations: geminiToolSchemas }]
            };
            
            console.log(`[${clientId}] System instruction injected (${systemInstruction.length} chars, includes tool docs from registry)`);
            console.log(`[${clientId}] VAD config: startSensitivity=LOW, endSensitivity=LOW, silenceDurationMs=400, prefixPaddingMs=30, activityHandling=START_OF_ACTIVITY_INTERRUPTS`);
            
            // Log tool declarations explicitly
            const toolDecls = config.tools?.[0]?.functionDeclarations || [];
            console.log(`[${clientId}] TOOLS BEING SENT TO GEMINI: ${toolDecls.length} tools`);
            toolDecls.forEach((tool, i) => {
              console.log(`  [${i + 1}] ${tool.name}`);
            });
            
            console.log(`[${clientId}] Session config:`, JSON.stringify(config, null, 2));

            // Estimate context window usage using tiktoken
            let encoder = null;
            const estimateTokens = (text) => {
              if (!text) return 0;
              try {
                if (!encoder) {
                  encoder = encoding_for_model('gpt-3.5-turbo');
                }
                return encoder.encode(text).length;
              } catch (error) {
                // Fallback to character-based estimation if tiktoken fails
                console.warn('[token-count] tiktoken failed, falling back to char estimation:', error);
                return Math.ceil((text || '').length / 4);
              }
            };
            const systemPromptTokens = estimateTokens(systemInstruction);

            // Calculate tool declaration tokens
            let toolDeclTokens = 0;
            for (const tool of toolRegistry.tools.values()) {
              const toolDecl = JSON.stringify(tool.providerSchemas.geminiNative);
              const toolDoc = tool.documentation || '';
              toolDeclTokens += estimateTokens(toolDecl + toolDoc);
            }

            const sessionInitTokens = systemPromptTokens + toolDeclTokens;
            setContextInitTokens(sessionInitTokens);

            console.log(`[Context] Session init: ~${sessionInitTokens} tokens`);
            console.log(`  - System prompt: ~${systemPromptTokens} tokens`);
            console.log(`  - Tool declarations (${toolRegistry.tools.size} tools): ~${toolDeclTokens} tokens`);
            console.log(`  - Gemini context limit: 1,000,000 tokens`);

            assertLiveApiAvailable(ai);
            geminiSession = await ai.live.connect({
              model: process.env.GEMINI_VOICE_MODEL || DEFAULT_GEMINI_VOICE_MODEL,
              config: config,
              callbacks: {
                onopen: () => {
                  console.log(`[${clientId}] WebSocket to Gemini opened`);
                },
                onmessage: async (message) => {
                  // Debug: Log ALL top-level keys in the message
                  const messageKeys = Object.keys(message);
                  console.log(`[${clientId}] Gemini message keys: [${messageKeys.join(', ')}]`);
                  
                  // Check for tool calls in various possible locations
                  if (message.toolCall) console.log(`[${clientId}] ✓ Found message.toolCall`);
                  if (message.toolCalls) console.log(`[${clientId}] ✓ Found message.toolCalls (plural)`);
                  if (message.serverContent?.toolCall) console.log(`[${clientId}] ✓ Found message.serverContent.toolCall`);
                  if (message.bidiGenerateContentToolCall) console.log(`[${clientId}] ✓ Found message.bidiGenerateContentToolCall`);
                  
                  // Log Gemini message but exclude audio data to reduce log noise
                  const logMessage = JSON.parse(JSON.stringify(message));
                  if (logMessage.serverContent?.modelTurn?.parts) {
                    logMessage.serverContent.modelTurn.parts = logMessage.serverContent.modelTurn.parts.map(part => {
                      if (part.inlineData?.data) {
                        return { inlineData: { mimeType: part.inlineData.mimeType, data: `[${part.inlineData.data.length} chars]` } };
                      }
                      return part;
                    });
                  }
                  console.log(`[${clientId}] Received message from Gemini:`, JSON.stringify(logMessage, null, 2));
                  await handleGeminiMessage(clientId, message);
                  // Note: History injection and audio buffer flushing are handled in handleGeminiMessage
                  // to ensure correct ordering (history BEFORE audio)
                },
                onerror: (error) => {
                  console.error(`[${clientId}] Gemini session error:`, error);
                  console.error(`[${clientId}] Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
                  
                  // Parse error to provide better feedback
                  let errorMessage = error.message || error.toString() || 'Gemini session error';
                  let errorDetails = null;
                  
                  // Handle authentication errors specifically
                  if (error.message && error.message.includes('invalid_grant')) {
                    errorMessage = 'Authentication failed: Invalid credentials. Please check your Google Cloud service account credentials.';
                    errorDetails = {
                      type: 'authentication_error',
                      suggestion: 'Verify that GOOGLE_APPLICATION_CREDENTIALS or service account credentials are valid and have the required permissions for Vertex AI.',
                      helpUrl: 'https://support.google.com/a/answer/9368756'
                    };
                    console.error(`[${clientId}] Authentication error detected. Check service account credentials and permissions.`);
                  } else if (error.message && error.message.includes('invalid_rapt')) {
                    errorMessage = 'Authentication failed: RAPT (Risk-Aware Protection Token) error. Your service account may need domain-wide delegation or additional scopes.';
                    errorDetails = {
                      type: 'authentication_error',
                      subtype: 'invalid_rapt',
                      suggestion: 'This error typically occurs when service account credentials are invalid or expired. Try: 1) Regenerating service account keys, 2) Verifying the service account has Vertex AI User role, 3) Using Application Default Credentials (gcloud auth application-default login)',
                      helpUrl: 'https://support.google.com/a/answer/9368756'
                    };
                    console.error(`[${clientId}] RAPT authentication error. Service account credentials may be invalid or expired.`);
                  } else if (error.message && error.message.includes('PERMISSION_DENIED')) {
                    errorMessage = 'Permission denied: Service account does not have required permissions for Vertex AI.';
                    errorDetails = {
                      type: 'permission_error',
                      suggestion: 'Grant the service account the "Vertex AI User" role in Google Cloud Console.',
                      helpUrl: 'https://cloud.google.com/vertex-ai/docs/general/access-control'
                    };
                    console.error(`[${clientId}] Permission denied. Check service account IAM roles.`);
                  }
                  
                  if (!sessionStarted) {
                    failSessionStartup(errorMessage, errorDetails);
                    return;
                  }

                  // Notify client - let client handle reconnection
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      error: errorMessage,
                      details: errorDetails
                    }));
                  }
                  // Mark session as closed on error
                  geminiSession = null;
                },
                onclose: (event) => {
                  console.log(`[${clientId}] Gemini session closed. Code: ${event?.code}, Reason: ${event?.reason}`);
                  console.log(`[${clientId}] Close event details:`, event);
                  if (!sessionStarted) {
                    failSessionStartup(
                      event?.reason || 'Gemini Live session closed before startup completed.',
                      null,
                      event?.code || 1011
                    );
                    return;
                  }
                  geminiSession = null;
                }
              }
            });
            assertLiveSession(geminiSession);

            // Initialize transport now that session exists
            transport = new GeminiLiveTransport(geminiSession);

            clearStartupTimeout();
            startupTimeout = setTimeout(() => {
              if (!sessionStarted) {
                console.error(`[${clientId}] Startup timed out waiting for Gemini setupComplete`);
                failSessionStartup('Voice session timed out while waiting for Gemini to initialize.');
              }
            }, STARTUP_TIMEOUT_MS);

            // Don't send 'started' yet - wait for setupComplete message
            console.log(`[${clientId}] Gemini Live session connecting, waiting for setup complete...`);
          } catch (error) {
            console.error(`[${clientId}] Failed to start session:`, error);
            
            // Parse error to provide better feedback
            let errorMessage = 'Failed to start session: ' + (error.message || error.toString());
            let errorDetails = null;
            
            // Handle authentication errors in catch block
            const errorString = JSON.stringify(error);
            if (errorString.includes('invalid_grant') || errorString.includes('invalid_rapt')) {
              errorMessage = 'Authentication failed: Invalid or expired service account credentials.';
              errorDetails = {
                type: 'authentication_error',
                suggestion: 'Check your GOOGLE_APPLICATION_CREDENTIALS or service account credentials. Try regenerating keys or using Application Default Credentials.',
                helpUrl: 'https://support.google.com/a/answer/9368756'
              };
              console.error(`[${clientId}] Authentication error during session start. Verify credentials.`);
            }
            
            failSessionStartup(errorMessage, errorDetails);
          }
          break;
        }

        case 'audio':
          // Validate audio data
          if (!data.data || typeof data.data !== 'string' || data.data.length === 0) {
            console.warn(`[${clientId}] Received empty or invalid audio chunk, skipping`);
            break;
          }
          
          const base64Length = data.data.length;
          
          // If session not ready yet, buffer the audio
          if (!sessionReady) {
            // Limit buffer size to prevent memory issues (max ~10 seconds of audio)
            if (audioBuffer.length < 100) {
              audioBuffer.push(data.data);
              console.log(`[${clientId}] Buffered audio chunk (${audioBuffer.length} chunks, ${base64Length} chars)`);
            } else {
              console.warn(`[${clientId}] Audio buffer full, dropping chunk`);
            }
            break;
          }
          
          // Session is ready, send audio directly
          if (geminiSession) {
            try {
              // If model is generating, require sustained speech before allowing barge-in
              // This prevents brief audio spikes from triggering interruption
              if (state.get('isModelGenerating')) {
                const currentCount = state.get('userAudioChunkCount') + 1;
                state.set('userAudioChunkCount', currentCount);
                
                // Require sustained speech (10 chunks ≈ 1 second) before allowing interruption
                const INTERRUPTION_THRESHOLD = 10;
                if (currentCount >= INTERRUPTION_THRESHOLD) {
                  if (!state.get('interruptionSent')) {
                    console.log(`[${clientId}] 🔴 USER INTERRUPTING - sustained speech detected (${currentCount} chunks)`);
                    state.set('interruptionSent', true);
                    
                    // Notify client to stop playback
                    ws.send(JSON.stringify({
                      type: 'interrupted'
                    }));
                  }
                  // Send audio to Gemini to trigger the interruption
                  sendAudioToGemini(data.data);
                }
                // Silently block audio during generation (chunk counting for barge-in)
                break;
              }
              
              // Model not generating - reset counter and send audio normally
              state.set('userAudioChunkCount', 0);
              sendAudioToGemini(data.data);
            } catch (error) {
              console.error(`[${clientId}] Error sending audio:`, error);
              console.error(`[${clientId}] Error stack:`, error.stack);
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to send audio: ' + error.message
              }));
            }
          } else {
            console.error(`[${clientId}] Session ready but geminiSession is null`);
          }
          break;

        case 'text':
          if (!sessionReady || !geminiSession) {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Voice session is not ready for text input yet.'
            }));
            break;
          }

          if (!data.data || typeof data.data !== 'string' || data.data.trim().length === 0) {
            console.warn(`[${clientId}] Received empty text message, skipping`);
            break;
          }

          sendTextToGemini(data.data.trim());
          break;

        case 'stop':
          console.log(`[${clientId}] Stopping session`);
          if (geminiSession) {
            try {
              // Close the Live API session
              geminiSession.close();
              
              // Send complete transcript history
              ws.send(JSON.stringify({
                type: 'session_complete',
                transcripts: conversationTranscripts
              }));
              
              geminiSession = null;
              sessionReady = false;
              sessionStarted = false;
              audioBuffer = [];
              pendingAudioBuffer = [];
              clearUserTurnTimeout();
              userTurnCompletionInProgress = false;
              conversationTranscripts = { user: [], assistant: [] };
              lastTranscriptText = { user: '', assistant: '' }; // Reset transcript deduplication tracking
              assistantTranscriptSentFromModelTurn = false;
              pendingMarkdownSnippets = [];
              pendingCitations = []; // Clear citations on session end
              state.set('pendingEndVoiceSession', null); // Clear any pending end session
              state.set('shouldSuppressAudio', false); // Reset audio suppression flag
              state.set('shouldSuppressTranscript', false); // Reset transcript suppression flag
              state.set('audioChunkCounter', 0); // Reset audio counter
              state.set('lastAudioFingerprint', null); // Reset audio fingerprint
              
              ws.send(JSON.stringify({ type: 'stopped' }));
            } catch (error) {
              console.error(`[${clientId}] Error stopping session:`, error);
            }
          } else {
            // Session already closed - still send completion to unblock UI
            console.log(`[${clientId}] Session already closed, sending completion anyway`);
            ws.send(JSON.stringify({
              type: 'session_complete',
              transcripts: conversationTranscripts
            }));
            ws.send(JSON.stringify({ type: 'stopped' }));
            sessionReady = false;
            sessionStarted = false;
            audioBuffer = [];
            pendingAudioBuffer = [];
            clearUserTurnTimeout();
            userTurnCompletionInProgress = false;
            conversationTranscripts = { user: [], assistant: [] };
            lastTranscriptText = { user: '', assistant: '' }; // Reset transcript deduplication tracking
            assistantTranscriptSentFromModelTurn = false;
            pendingMarkdownSnippets = [];
            state.set('pendingEndVoiceSession', null); // Clear any pending end session
            state.set('shouldSuppressAudio', false); // Reset audio suppression flag
            state.set('shouldSuppressTranscript', false); // Reset transcript suppression flag
            state.set('audioChunkCounter', 0); // Reset audio counter
            state.set('lastAudioFingerprint', null); // Reset audio fingerprint
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'turn_complete':
          // Client signaled turn complete - tell Gemini to respond
          console.log(`[${clientId}] Client signaled turn complete - telling Gemini to respond`);
          await finalizeUserTurn('client_signal');
          break;

        default:
          console.warn(`[${clientId}] Unknown message type: ${data.type}`);
          ws.send(JSON.stringify({
            type: 'error',
            error: `Unknown message type: ${data.type}`
          }));
      }
    } catch (error) {
      console.error(`[${clientId}] Error processing message:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message: ' + error.message
      }));
    }
  });

  // Handle client disconnect
  ws.on('close', async (code) => {
    console.log(`[${clientId}] Client disconnected. Code: ${code}`);

    // Clean up session tracking (NEW)
    endSession(clientId);
    loopDetector.clearSession(clientId);
    clearUserTurnTimeout();
    clearStartupTimeout();
    userTurnCompletionInProgress = false;
    pendingAudioBuffer = [];

    if (geminiSession) {
      try {
        geminiSession.close();
      } catch (error) {
        console.error(`[${clientId}] Error cleaning up session:`, error);
      }
    }
  });

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error(`[${clientId}] WebSocket error:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: Date.now()
  }));
});

// Handle uncaught exceptions during startup
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception during startup:', error);
  console.error('[FATAL] Error stack:', error.stack);
  console.error('[FATAL] Current working directory:', process.cwd());
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  console.error('[FATAL] Promise:', promise);
  if (reason instanceof Error) {
    console.error('[FATAL] Error stack:', reason.stack);
  }
  process.exit(1);
});

// Start server
console.log('[STARTUP] Starting HTTP server...');
console.log('[STARTUP] Current working directory:', process.cwd());
console.log('[STARTUP] PORT:', PORT);

try {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[STARTUP] ✓ Voice Server listening on port ${PORT}`);
    console.log(`[STARTUP]   WebSocket: ws://0.0.0.0:${PORT}`);
    console.log(`[STARTUP]   Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`[STARTUP]   Server ready and accepting connections`);
  });
} catch (error) {
  console.error('[FATAL] Failed to start HTTP server:', error);
  console.error('[FATAL] Error stack:', error.stack);
  process.exit(1);
}

// Handle server errors
httpServer.on('error', (error) => {
  console.error('[ERROR] HTTP server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} is already in use`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  wss.close(() => {
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  wss.close(() => {
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});
