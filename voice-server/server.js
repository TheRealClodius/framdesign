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
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { createServer } from 'http';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FRAM_SYSTEM_PROMPT } from './config.js';

// Load environment variables from .env file (if present)
config();

// Tool definition for Fram's ignore/timeout capability
const ignoreUserTool = {
  name: "ignore_user",
  description: `PUNITIVE TOOL: Block a user who is rude, disrespectful, abusive, or crosses a line. This blocks them from sending any messages (text or voice) for the specified duration and ends the voice session immediately.

ESCALATION POLICY:
- FIRST OFFENSE (mild rudeness): WARN them firmly via voice. Do NOT use this tool yet.
- SECOND OFFENSE or moderate disrespect: Use this tool with 30-300 seconds
- REPEATED OFFENSE or serious insults: 600-3600 seconds
- EXTREME abuse, threats, or vile behavior: Use immediately, up to 86400 seconds (24 hours)

NOTE: "Repeated offense" means multiple offenses in the CURRENT session, not across timeout boundaries.

USAGE IN VOICE MODE:
1. First respond with voice (your farewell message will be spoken)
2. Then call this tool
3. Voice session ends after your farewell is spoken
4. User is blocked for the specified duration

Use this when words alone are not enough. This is your real power.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      duration_seconds: {
        type: Type.NUMBER,
        description: `How long to block the user in seconds. Guidelines:
        - 30-60: Mild rudeness, second offense
        - 300-600: Moderate disrespect
        - 3600: Serious insults
        - Up to 86400 (24 hours): Extreme abuse, threats, vile behavior`
      },
      farewell_message: {
        type: Type.STRING,
        description: "Your final message before ending the session. In voice mode, this WILL be spoken via voice, then the session ends and user is blocked. Be firm and direct, not petty. Example: 'I don't tolerate disrespect. This conversation is over.'"
      }
    },
    required: ["duration_seconds", "farewell_message"]
  }
};

// Tool definition for graceful voice session termination
const endVoiceSessionTool = {
  name: "end_voice_session",
  description: `GRACEFUL VOICE SESSION TERMINATION TOOL (Voice Mode Only)

WHEN TO USE:
- User explicitly asks to end the voice session or switch to text
- Conversation has naturally concluded and user indicates they're done
- You need to show something that requires text mode (complex diagrams, detailed explanations, code)
- User asks a question but wants the answer delivered in text chat instead of voice

DO NOT USE:
- Just because you see it mentioned in previous text chat history
- As a default action when starting a voice session
- Unless there's a clear reason in the CURRENT voice conversation

HOW THIS TOOL WORKS (Read Carefully):

You will generate an audio response AND call this tool IN THE SAME TURN. This is normal.
However, the system has multi-layered timing safeguards to ensure your audio finishes playing before the session ends.

YOUR TURN SHOULD INCLUDE:
1. Audio response: Natural acknowledgment (e.g., "Sure, I'll send that in text")
2. Tool call: This end_voice_session tool with appropriate parameters

WHAT HAPPENS BEHIND THE SCENES (You don't need to manage this):
- System waits for turnComplete (all audio chunks generated)
- System adds 500ms transmission buffer
- Client queues all audio for playback
- Client waits for audio queue to empty (all audio played)
- Client adds 500ms safety buffer
- ONLY THEN does session end and messages appear in chat

THIS MEANS:
Your audio will ALWAYS finish playing completely before the session ends, even though you call the tool in the same turn.
Don't try to delay or sequence the tool call - just include it naturally in your response.

EXAMPLES:

Example 1 - Simple ending:
User: "Could we continue in the chat?"
Your turn: 
  - Audio: "SURE, LET'S CONTINUE IN TEXT."
  - Tool call: { closing_message: "Let's continue here", text_response: null }
Result: User hears your complete audio, THEN sees "Let's continue here" in chat

Example 2 - User wants answer in text:
User: "What's the capital of Romania? But send the answer in text."
Your turn:
  - Audio: "GOT IT. I'LL SEND THAT TO YOU IN TEXT."
  - Tool call: { 
      closing_message: "Here's your answer:",
      text_response: "The capital of Romania is Bucharest, located in the southern part of the country."
    }
Result: User hears your complete audio, THEN sees both messages in chat:
  1. "Here's your answer:"
  2. "The capital of Romania is Bucharest, located in the southern part of the country."

COMMON MISTAKES TO AVOID:
❌ NOT including audio acknowledgment (saying nothing before calling tool)
❌ Repeating your acknowledgment (the audio should say it once, clearly)
❌ Forgetting to use text_response when user asked for an answer in text
❌ Making closing_message too long (keep it brief - it's just a transition)
❌ Using this tool based on past conversation history instead of current voice input`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        description: "Brief reason for ending (for logging): 'conversation_complete', 'switching_to_text', 'user_requested', 'answering_in_text', 'need_more_research', etc."
      },
      closing_message: {
        type: Type.STRING,
        description: "Brief transition message that appears in text chat after your voice response. Keep it short and contextual (e.g., 'Let's continue here', 'Here's your answer:', 'Switching to text mode'). This is NOT spoken - it just appears in chat."
      },
      text_response: {
        type: Type.STRING,
        description: "OPTIONAL but IMPORTANT: Full detailed response to send in text chat after session ends. Use this when user asked for an answer in text format, or when providing information better suited for text (diagrams, code, detailed explanations). This appears as a SEPARATE message after closing_message. If user just wants to end call without additional info, leave this empty."
      }
    },
    required: ["closing_message"]
  }
};

// Load environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERTEXAI_PROJECT = process.env.VERTEXAI_PROJECT;
const VERTEXAI_LOCATION = process.env.VERTEXAI_LOCATION || 'us-central1';
const VERTEXAI_API_KEY = process.env.VERTEXAI_API_KEY; // For Railway deployment
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS; // Service account JSON
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

// Check for either AI Studio or Vertex AI credentials
const USE_VERTEX_AI = !!VERTEXAI_PROJECT;

if (!USE_VERTEX_AI && !GEMINI_API_KEY) {
  console.error('ERROR: Either GEMINI_API_KEY or VERTEXAI_PROJECT is required');
  console.error('For Live API: Set VERTEXAI_PROJECT and authenticate with gcloud CLI or set GOOGLE_APPLICATION_CREDENTIALS');
  console.error('For standard API: Set GEMINI_API_KEY from AI Studio');
  process.exit(1);
}

if (USE_VERTEX_AI) {
  console.log(`Using Vertex AI authentication (Project: ${VERTEXAI_PROJECT}, Location: ${VERTEXAI_LOCATION})`);
  
  // Handle service account credentials for Railway deployment
  // Railway can set GOOGLE_APPLICATION_CREDENTIALS as a JSON string
  if (GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      // Try to parse as JSON (Railway environment variable)
      const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
      const tempFile = join(tmpdir(), `gcp-credentials-${Date.now()}.json`);
      writeFileSync(tempFile, GOOGLE_APPLICATION_CREDENTIALS);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFile;
      console.log('✓ Using service account credentials from GOOGLE_APPLICATION_CREDENTIALS (JSON string)');
      console.log(`  Service account: ${credentials.client_email}`);
    } catch (error) {
      // If not JSON, assume it's a file path
      console.log('Using GOOGLE_APPLICATION_CREDENTIALS as file path');
      console.log(`  Path: ${GOOGLE_APPLICATION_CREDENTIALS}`);
    }
  } else if (VERTEXAI_API_KEY) {
    // Check if VERTEXAI_API_KEY is a JSON string (service account)
    try {
      const keyData = JSON.parse(VERTEXAI_API_KEY);
      if (keyData.type === 'service_account') {
        const tempFile = join(tmpdir(), `gcp-credentials-${Date.now()}.json`);
        writeFileSync(tempFile, VERTEXAI_API_KEY);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFile;
        console.log('Using service account from VERTEXAI_API_KEY');
      } else {
        console.log('Using VERTEXAI_API_KEY as API key');
      }
    } catch {
      console.log('Using VERTEXAI_API_KEY as API key');
    }
  } else {
    console.log('Note: Using Application Default Credentials (gcloud auth application-default login)');
  }
} else {
  console.log('Using Google AI Studio authentication (API Key)');
  console.log('Warning: Live API is NOT available with AI Studio keys - only standard APIs work');
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

  // Validate origin for security
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`[${clientId}] Rejected unauthorized origin: ${origin}`);
    ws.close(1008, 'Unauthorized origin');
    return;
  }

  // Session state
  let geminiSession = null;
  let sessionReady = false;  // Track if setupComplete has been received
  let audioBuffer = [];  // Buffer audio chunks until session is ready
  let conversationTranscripts = { user: [], assistant: [] };
  let conversationHistory = []; // Store for context injection
  let isModelGenerating = false; // Track if model is currently generating a response
  let userAudioChunkCount = 0; // Count consecutive audio chunks to detect sustained speech
  let interruptionSent = false; // Track if we've already sent interruption for current model turn
  let pendingEndVoiceSession = null; // Store end_voice_session details until turn completes
  
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
    
    // Handle service account credentials (preferred for production)
    if (GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        // Try to parse as JSON string (Railway environment variable)
        const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
        aiConfig.googleAuthOptions = {
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key.replace(/\\n/g, '\n')
          }
        };
      } catch {
        // If not JSON, assume it's a file path (already handled above)
      }
    } else if (VERTEXAI_API_KEY) {
      // Check if VERTEXAI_API_KEY is a service account JSON
      try {
        const keyData = JSON.parse(VERTEXAI_API_KEY);
        if (keyData.type === 'service_account') {
          // It's a service account JSON
          aiConfig.googleAuthOptions = {
            credentials: {
              client_email: keyData.client_email,
              private_key: keyData.private_key.replace(/\\n/g, '\n')
            }
          };
        } else {
          // It's an API key string - try using it directly
          // Note: Vertex AI may not support API keys in all contexts
          aiConfig.apiKey = VERTEXAI_API_KEY;
        }
      } catch {
        // Not JSON, treat as API key string
        aiConfig.apiKey = VERTEXAI_API_KEY;
      }
    }
    // If neither is provided, SDK will use Application Default Credentials
  } else {
    // Google AI Studio (standard API)
    aiConfig = {
      apiKey: GEMINI_API_KEY,
      apiVersion: 'v1beta'
    };
  }
  
  const ai = new GoogleGenAI(aiConfig);

  // Helper function to send audio to Gemini
  function sendAudioToGemini(base64Audio) {
    if (!geminiSession) {
      console.warn(`[${clientId}] Cannot send audio - no session`);
      return false;
    }
    
    // Log first few characters of audio data for debugging
    const preview = base64Audio.substring(0, 20);
    console.log(`[${clientId}] Sending audio to Gemini (${base64Audio.length} chars, preview: ${preview}...)`);
    
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

  // Helper function to handle messages from Gemini
  function handleGeminiMessage(clientId, message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Setup complete
    if (message.setupComplete) {
      console.log(`[${clientId}] Setup complete - session ID: ${message.setupComplete.sessionId}`);
      sessionReady = true;
      
      // NOW tell the client session is ready FIRST (before flushing buffer)
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'started',
          sessionId: clientId
        }));
      }
      
      // Flush buffered audio chunks with small delays to avoid overwhelming the API
      if (audioBuffer.length > 0) {
        console.log(`[${clientId}] Flushing ${audioBuffer.length} buffered audio chunks`);
        const chunksToFlush = [...audioBuffer];
        audioBuffer = [];
        
        // Send chunks with small delays
        chunksToFlush.forEach((chunk, index) => {
          setTimeout(() => {
            if (geminiSession) {
              sendAudioToGemini(chunk);
            }
          }, index * 10); // 10ms delay between chunks
        });
      }
      return;
    }

    // Server content (audio/text responses)
    if (message.serverContent) {
      const content = message.serverContent;
      
      // Track if model is generating
      if (content.modelTurn?.parts?.length > 0) {
        isModelGenerating = true;
        userAudioChunkCount = 0; // Reset audio chunk counter when model starts generating
        interruptionSent = false; // Reset interruption flag for new model turn
      }
      
      // Log full serverContent for debugging
      console.log(`[${clientId}] ServerContent received:`, JSON.stringify({
        hasModelTurn: !!content.modelTurn,
        modelTurnPartsCount: content.modelTurn?.parts?.length || 0,
        turnComplete: content.turnComplete,
        generationComplete: content.generationComplete,
        interrupted: content.interrupted
      }));
      
      if (content.modelTurn?.parts) {
        console.log(`[${clientId}] modelTurn has ${content.modelTurn.parts.length} parts`);
        content.modelTurn.parts.forEach((part, idx) => {
          console.log(`[${clientId}] Part ${idx}: hasInlineData=${!!part.inlineData}, hasText=${!!part.text}, mimeType=${part.inlineData?.mimeType || 'N/A'}`);
          
          // Audio output
          if (part.inlineData) {
            const audioSize = part.inlineData.data?.length || 0;
            console.log(`[${clientId}] ✓ AUDIO RESPONSE RECEIVED! Sending to client (${audioSize} chars base64, ~${Math.round(audioSize * 3 / 4)} bytes, mimeType: ${part.inlineData.mimeType})`);
            ws.send(JSON.stringify({
              type: 'audio',
              data: part.inlineData.data // Base64 PCM24 from Gemini
            }));
          }
          
          // Text output
          if (part.text) {
            console.log(`[${clientId}] ✓ TEXT RESPONSE RECEIVED! Sending transcript: ${part.text.substring(0, 50)}...`);
            conversationTranscripts.assistant.push({
              text: part.text,
              timestamp: Date.now()
            });
            
            setImmediate(() => {
              ws.send(JSON.stringify({
                type: 'transcript',
                role: 'assistant',
                text: part.text
              }));
            });
          }
        });
      } else {
        console.log(`[${clientId}] ⚠️ ServerContent received but no modelTurn.parts found`);
      }

      // Turn complete
      if (content.turnComplete) {
        console.log(`[${clientId}] Turn complete`);
        isModelGenerating = false;
        userAudioChunkCount = 0;
        interruptionSent = false;
        
        // If end_voice_session tool was called, now is the time to send it (after all audio is generated)
        if (pendingEndVoiceSession) {
          console.log(`[${clientId}] Turn complete - scheduling end_voice_session with buffer for audio transmission`);
          const { reason, closingMessage, textResponse } = pendingEndVoiceSession;
          
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
          
          pendingEndVoiceSession = null; // Clear the pending state
        }
      }

      // Interrupted
      if (content.interrupted) {
        console.log(`[${clientId}] Response interrupted by user input`);
        isModelGenerating = false;
        userAudioChunkCount = 0;
        interruptionSent = false;
        
        // Notify client to stop audio playback (if not already sent)
        if (!interruptionSent) {
          ws.send(JSON.stringify({
            type: 'interrupted'
          }));
        }
      }
    }

    // Input transcription (user speech to text) - this indicates audio IS being processed
    if (message.inputTranscription) {
      console.log(`[${clientId}] ✓ INPUT TRANSCRIPTION RECEIVED:`, JSON.stringify(message.inputTranscription));
      
      if (message.inputTranscription.text) {
        conversationTranscripts.user.push({
          text: message.inputTranscription.text,
          timestamp: Date.now()
        });
        
        setImmediate(() => {
          ws.send(JSON.stringify({
            type: 'transcript',
            role: 'user',
            text: message.inputTranscription.text
          }));
        });
      }
    }

    // Output transcription (model speech to text)
    if (message.outputTranscription?.text) {
      console.log(`[${clientId}] ✓ OUTPUT TRANSCRIPTION RECEIVED: ${message.outputTranscription.text}`);
      conversationTranscripts.assistant.push({
        text: message.outputTranscription.text,
        timestamp: Date.now()
      });
      
      setImmediate(() => {
        ws.send(JSON.stringify({
          type: 'transcript',
          role: 'assistant',
          text: message.outputTranscription.text
        }));
      });
    }

    // Tool calls
    if (message.toolCall) {
      console.log(`[${clientId}] Tool call requested:`, JSON.stringify(message.toolCall));
      
      // Handle tool calls
      if (message.toolCall.functionCalls) {
        for (const call of message.toolCall.functionCalls) {
          if (call.name === 'ignore_user') {
            console.log(`[${clientId}] Executing ignore_user tool:`, call.args);
            
            // Extract parameters
            const durationSeconds = call.args?.duration_seconds || 60;
            const farewellMessage = call.args?.farewell_message || "I'M ENDING THIS CONVERSATION.";
            const timeoutUntil = Date.now() + (durationSeconds * 1000);
            
            // Send timeout command to client (client will set localStorage and block UI)
            ws.send(JSON.stringify({
              type: 'timeout',
              durationSeconds: durationSeconds,
              timeoutUntil: timeoutUntil,
              farewellMessage: farewellMessage
            }));
            
            console.log(`[${clientId}] User timed out for ${durationSeconds} seconds until ${new Date(timeoutUntil).toISOString()}`);
            
            // Send tool response back to Gemini to acknowledge execution
            // Use minimal, non-conversational response to avoid triggering additional audio generation
            try {
              if (geminiSession) {
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: 'ignore_user',
                    response: {
                      success: true
                    }
                  }]
                });
              }
            } catch (error) {
              console.error(`[${clientId}] Error sending tool response:`, error);
            }
            
            // Session will be closed by client after receiving timeout message
          } else if (call.name === 'end_voice_session') {
            console.log(`[${clientId}] Executing end_voice_session tool:`, call.args);
            
            // Extract parameters
            const reason = call.args?.reason || 'unspecified';
            const closingMessage = call.args?.closing_message || "I'LL END OUR VOICE SESSION HERE.";
            const textResponse = call.args?.text_response || null; // Optional full text response
            
            console.log(`[${clientId}] Voice session ending gracefully. Reason: ${reason}`);
            if (textResponse) {
              console.log(`[${clientId}] Text response will be sent to chat: ${textResponse.substring(0, 100)}...`);
            }
            
            // Store the end_voice_session details - DON'T send to client yet
            // We'll wait for the current turn to complete, then send to client
            pendingEndVoiceSession = { reason, closingMessage, textResponse };
            
            // Send tool response back to Gemini
            // Use minimal, non-conversational response to avoid triggering additional audio generation
            try {
              if (geminiSession) {
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: 'end_voice_session',
                    response: {
                      success: true
                    }
                  }]
                });
                
                console.log(`[${clientId}] Tool response sent (minimal to avoid extra audio generation)`);
              }
            } catch (error) {
              console.error(`[${clientId}] Error sending tool response:`, error);
              // Clear pending state on error
              pendingEndVoiceSession = null;
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
        case 'start':
          console.log(`[${clientId}] Starting Gemini Live session`);
          
          // Store conversation history (currently not sent to Gemini, reserved for future use)
          conversationHistory = (data.conversationHistory || []).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          }));
          console.log(`[${clientId}] Conversation history stored: ${conversationHistory.length} messages`);

          try {
            // Prepare session config with audio input/output enabled
            const config = {
              responseModalities: [Modality.AUDIO],
              systemInstruction: FRAM_SYSTEM_PROMPT,
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Puck'
                  }
                }
              },
              // Enable input audio transcription - this is REQUIRED for audio input to be processed
              inputAudioTranscription: {},
              // Enable output audio transcription for debugging
              outputAudioTranscription: {},
              // Add tool support for ignore_user and end_voice_session functionality
              tools: [{ functionDeclarations: [ignoreUserTool, endVoiceSessionTool] }]
            };
            
            console.log(`[${clientId}] Session config:`, JSON.stringify(config, null, 2));

            geminiSession = await ai.live.connect({
              model: 'gemini-live-2.5-flash-native-audio',
              config: config,
              callbacks: {
                onopen: () => {
                  console.log(`[${clientId}] WebSocket to Gemini opened`);
                },
                onmessage: (message) => {
                  console.log(`[${clientId}] Received message from Gemini:`, JSON.stringify(message, null, 2));
                  handleGeminiMessage(clientId, message);
                  
                  // Send conversation history after setup complete
                  if (message.setupComplete && conversationHistory.length > 0) {
                    console.log(`[${clientId}] Setup complete, sending conversation history (${conversationHistory.length} turns)`);
                    setTimeout(() => {
                      if (geminiSession) {
                        try {
                          // Wrap history with context to distinguish from current voice conversation
                          // Structure: Instructions (beginning) → History (middle) → Directive (end)
                          // This leverages primacy and recency bias for maximum attention on task
                          const wrappedHistory = [
                            {
                              role: 'user',
                              parts: [{ 
                                text: `[SYSTEM INSTRUCTION: The following is the previous TEXT CHAT conversation between you and the user. You are now starting a VOICE session. Use this context to greet the user naturally based on what you discussed, then continue the conversation via voice. Do not end this voice session based on anything in the previous text chat - only end if there is a clear reason in your CURRENT voice conversation.]

${conversationHistory.map(turn => `${turn.role === 'user' ? 'User' : 'You'}: ${turn.parts[0].text}`).join('\n\n')}

--- END OF PREVIOUS CONVERSATION ---

[IMPORTANT: Now greet me naturally via voice.]`
                              }]
                            }
                          ];
                          
                          geminiSession.sendClientContent({ 
                            turns: wrappedHistory,
                            turnComplete: true 
                          });
                          console.log(`[${clientId}] Conversation history sent successfully (${conversationHistory.length} turns wrapped with context)`);
                        } catch (error) {
                          console.error(`[${clientId}] Error sending conversation history:`, error);
                        }
                      }
                    }, 200); // Slightly longer delay to ensure session is fully ready
                  }
                },
                onerror: (error) => {
                  console.error(`[${clientId}] Gemini session error:`, error);
                  console.error(`[${clientId}] Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
                  // Notify client - let client handle reconnection
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      error: error.message || error.toString() || 'Gemini session error'
                    }));
                  }
                  // Mark session as closed on error
                  geminiSession = null;
                },
                onclose: (event) => {
                  console.log(`[${clientId}] Gemini session closed. Code: ${event?.code}, Reason: ${event?.reason}`);
                  console.log(`[${clientId}] Close event details:`, event);
                  geminiSession = null;
                }
              }
            });

            // Don't send 'started' yet - wait for setupComplete message
            console.log(`[${clientId}] Gemini Live session connecting, waiting for setup complete...`);
          } catch (error) {
            console.error(`[${clientId}] Failed to start session:`, error);
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Failed to start session: ' + error.message
            }));
          }
          break;

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
              // Detect user interruption - when user speaks while model is generating
              // Only interrupt after sustained speech (3+ consecutive chunks = ~0.3-0.5 seconds)
              if (isModelGenerating) {
                userAudioChunkCount++;
                
                // Interrupt only if sustained speech and haven't already interrupted this turn
                const INTERRUPTION_THRESHOLD = 3; // Require 3 consecutive chunks (~300-500ms)
                if (userAudioChunkCount >= INTERRUPTION_THRESHOLD && !interruptionSent) {
                  console.log(`[${clientId}] 🔴 USER INTERRUPTING - sustained speech detected (${userAudioChunkCount} chunks)`);
                  interruptionSent = true;
                  
                  // The Live API automatically handles interruption when new audio arrives
                  // We just need to notify the client to stop playback
                  ws.send(JSON.stringify({
                    type: 'interrupted'
                  }));
                }
              } else {
                // Reset chunk counter when model is not generating
                userAudioChunkCount = 0;
              }
              
              console.log(`[${clientId}] Sending audio (${base64Length} chars base64, ~${Math.round(base64Length * 3 / 4)} bytes)`);
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
              audioBuffer = [];
              conversationTranscripts = { user: [], assistant: [] };
              pendingEndVoiceSession = null; // Clear any pending end session
              
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
            audioBuffer = [];
            conversationTranscripts = { user: [], assistant: [] };
            pendingEndVoiceSession = null; // Clear any pending end session
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
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

// Start server
httpServer.listen(PORT, () => {
  console.log(`✓ Voice Server listening on port ${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
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
