#!/usr/bin/env node

/**
 * Voice Agent Test CLI Tool
 *
 * Tests the voice agent using Gemini Live API with complete observability.
 * Uses the @google/genai SDK (same as production voice-server).
 * Supports non-interactive mode with pre-recorded audio files.
 */

import { config } from 'dotenv';
import { GoogleGenAI, Modality } from '@google/genai';
import { readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  formatQuestionHeader,
  formatStepHeader,
  formatFinalResponse,
  formatTestSummary,
  formatError,
  formatToolCall
} from './text-agent-test-formatter.js';

// Tool system imports
import { toolRegistry } from '../tools/_core/registry.js';
import { buildSystemInstruction } from '../voice-server/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tool schemas for Gemini (loaded at startup)
let geminiToolSchemas = [];

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

// Load tool registry at startup
try {
  console.log('Loading tool registry...');
  await toolRegistry.load();
  geminiToolSchemas = toolRegistry.getProviderSchemas('geminiNative');
  console.log(`✓ Loaded ${geminiToolSchemas.length} tools: ${geminiToolSchemas.map(t => t.name).join(', ')}\n`);
} catch (error) {
  console.error('Failed to load tool registry:', error.message);
  console.log('Continuing without tools...\n');
  geminiToolSchemas = [];
}

// Parse command line arguments
const args = process.argv.slice(2);
const isInteractive = args.includes('--interactive');
const isNonInteractive = args.includes('--non-interactive');
const verboseMode = args.includes('--verbose');
const singleQuestionArg = args.find(arg => arg.startsWith('--question='));
const singleQuestionId = singleQuestionArg ? parseInt(singleQuestionArg.split('=')[1]) : null;
// Content mode is default for pre-recorded audio; realtime mode for microphone-like streaming
const useRealtimeMode = args.includes('--realtime-mode');
const useContentMode = !useRealtimeMode;

if (!isInteractive && !isNonInteractive) {
  console.error(formatError('Please specify --interactive or --non-interactive'));
  console.log('\nUsage:');
  console.log('  node scripts/voice-agent-test.js --non-interactive   # Run test audio files');
  console.log('  node scripts/voice-agent-test.js --interactive       # Live microphone input');
  console.log('\nOptions:');
  console.log('  --verbose                                            # Show detailed logs');
  console.log('  --question=N                                         # Run only question N');
  console.log('  --realtime-mode                                      # Stream audio like microphone');
  console.log('\nNote: Run scripts/generate-test-audio.js first to create audio test files');
  process.exit(1);
}

// Test summary
let testSummary = {
  totalDuration: 0,
  questions: 0,
  responses: 0,
  successful: 0,
  failed: 0,
  toolCalls: {},
  totalToolCalls: 0,
  avgResponseTime: 0,
  startTime: Date.now(),
  audioMetrics: {
    totalAudioLatency: 0,
    avgAudioLatency: 0,
    transcriptionAccuracy: []
  }
};

/**
 * Create Gemini AI client
 * Handles both API key auth and Vertex AI with service account credentials
 */
async function createAIClient() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const VERTEXAI_PROJECT = process.env.VERTEXAI_PROJECT;
  const VERTEXAI_LOCATION = process.env.VERTEXAI_LOCATION || 'us-central1';
  const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Prefer Vertex AI if configured (same as production server)
  if (VERTEXAI_PROJECT) {
    console.log(`Using Vertex AI (Project: ${VERTEXAI_PROJECT}, Location: ${VERTEXAI_LOCATION})`);

    // Handle GOOGLE_APPLICATION_CREDENTIALS that contains JSON instead of a file path
    if (GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        // Try to parse as JSON (environment variable stores JSON as string)
        const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
        const tempFile = path.join(tmpdir(), `gcp-credentials-test-${Date.now()}.json`);
        await writeFile(tempFile, GOOGLE_APPLICATION_CREDENTIALS);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFile;
        console.log(`✓ Using service account: ${credentials.client_email}`);
      } catch {
        // Not JSON - it's a file path, which is the standard usage
        console.log(`✓ Using credentials file: ${GOOGLE_APPLICATION_CREDENTIALS}`);
      }
    }

    return new GoogleGenAI({
      vertexai: true,
      project: VERTEXAI_PROJECT,
      location: VERTEXAI_LOCATION
    });
  }

  if (GEMINI_API_KEY) {
    console.log('Using Google AI Studio (API Key)');
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  throw new Error('Missing credentials. Set GEMINI_API_KEY or VERTEXAI_PROJECT.');
}

/**
 * Create a live session with Gemini
 */
async function createLiveSession(ai) {
  return new Promise((resolve, reject) => {
    let session = null;
    let responseData = {
      transcript: '',
      inputTranscript: '',
      audioChunks: [],
      toolCalls: [],
      toolResults: [],
      complete: false,
      startTime: null
    };
    let responseResolver = null;
    let responseRejecter = null;
    let responseTimeout = null;
    let isExecutingTools = false;

    // Build system instruction with tool documentation (same as production)
    const systemInstruction = geminiToolSchemas.length > 0
      ? buildSystemInstruction(toolRegistry)
      : `You are FRAM's AI assistant. You have access to a knowledge base about FRAM Design, Andrei Clodius, and their projects. Be helpful, accurate, and concise. Answer questions naturally and conversationally. Keep responses brief since this is voice output.`;

    // Build session config
    const sessionConfig = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemInstruction,
      // Include tool declarations if tools are loaded
      ...(geminiToolSchemas.length > 0 && {
        tools: [{ functionDeclarations: geminiToolSchemas }]
      }),
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Algenib'
          }
        }
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          silenceDurationMs: 500,
          prefixPaddingMs: 50
        },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY'
      }
    };

    ai.live.connect({
      model: 'gemini-live-2.5-flash-native-audio',
      config: sessionConfig,
      callbacks: {
        onopen: () => {
          if (verboseMode) {
            console.log('  ✓ Live session opened');
          }
        },
        onmessage: async (message) => {
          if (verboseMode) {
            const keys = Object.keys(message);
            console.log(`  📩 Message keys: [${keys.join(', ')}]`);
            // Log full message structure for debugging (truncate audio data)
            const logMessage = JSON.parse(JSON.stringify(message));
            if (logMessage.serverContent?.modelTurn?.parts) {
              logMessage.serverContent.modelTurn.parts = logMessage.serverContent.modelTurn.parts.map(part => {
                if (part.inlineData?.data) {
                  return { inlineData: { mimeType: part.inlineData.mimeType, data: `[${part.inlineData.data.length} chars]` } };
                }
                return part;
              });
            }
            console.log(`  📦 Message:`, JSON.stringify(logMessage, null, 2));
          }

          // Handle setup complete
          if (message.setupComplete) {
            if (verboseMode) {
              console.log('  ✓ Setup complete');
            }
            resolve({
              session,
              sendAudio: async (base64Audio) => {
                if (!session) throw new Error('Session not initialized');
                if (!responseData.startTime) {
                  responseData.startTime = Date.now();
                }
                session.sendRealtimeInput({
                  audio: {
                    data: base64Audio,
                    mimeType: 'audio/pcm;rate=16000'
                  }
                });
              },
              // Alternative: Send audio as a content turn (for pre-recorded audio)
              sendAudioAsContent: async (base64Audio) => {
                if (!session) throw new Error('Session not initialized');
                if (!responseData.startTime) {
                  responseData.startTime = Date.now();
                }
                await session.sendClientContent({
                  turns: [{
                    role: 'user',
                    parts: [{
                      inlineData: {
                        mimeType: 'audio/wav',
                        data: base64Audio
                      }
                    }]
                  }],
                  turnComplete: true
                });
              },
              signalTurnComplete: async () => {
                if (!session) throw new Error('Session not initialized');
                // Signal to Gemini that user's turn is complete and it should respond
                await session.sendClientContent({ turnComplete: true });
              },
              waitForResponse: (timeout = 30000) => {
                return new Promise((res, rej) => {
                  responseResolver = res;
                  responseRejecter = rej;
                  responseTimeout = setTimeout(() => {
                    rej(new Error('Response timeout'));
                  }, timeout);
                });
              },
              close: () => {
                if (responseTimeout) clearTimeout(responseTimeout);
                if (session) session.close();
              },
              getResponseData: () => responseData,
              resetResponseData: () => {
                responseData = {
                  transcript: '',
                  inputTranscript: '',
                  audioChunks: [],
                  toolCalls: [],
                  toolResults: [],
                  complete: false,
                  startTime: null
                };
              }
            });
            return;
          }

          // Handle server content (transcripts, audio)
          if (message.serverContent) {
            const { modelTurn, turnComplete, inputTranscription } = message.serverContent;

            // Capture input transcription (what Gemini heard from user audio)
            if (inputTranscription?.text) {
              responseData.inputTranscript += inputTranscription.text;
              if (verboseMode) {
                console.log(`  🎤 Heard: "${inputTranscription.text}"`);
              }
            }

            // Capture model output
            if (modelTurn?.parts) {
              for (const part of modelTurn.parts) {
                if (part.text) {
                  responseData.transcript += part.text;
                }
                if (part.inlineData?.data) {
                  responseData.audioChunks.push(part.inlineData.data);
                }
              }
            }

            // Handle turn complete - but only resolve if we're not waiting for tool execution
            if (turnComplete && !isExecutingTools) {
              // Only resolve if we have content OR if we've already had tool calls
              // (the model might send turnComplete with no new content after tool results)
              const hasContent = responseData.transcript || responseData.audioChunks.length > 0;
              const hadToolCalls = responseData.toolCalls.length > 0;

              if (hasContent || hadToolCalls) {
                responseData.complete = true;
                responseData.duration = responseData.startTime
                  ? Date.now() - responseData.startTime
                  : 0;

                if (responseTimeout) {
                  clearTimeout(responseTimeout);
                  responseTimeout = null;
                }

                if (responseResolver) {
                  responseResolver({ ...responseData });
                  responseResolver = null;
                }
              }
            }
          }

          // Handle output transcription (comes as separate streaming messages)
          if (message.serverContent?.outputTranscription?.text) {
            const text = message.serverContent.outputTranscription.text;
            responseData.transcript += text;
            if (verboseMode) {
              console.log(`  🗣️ Transcript chunk: "${text}"`);
            }
          }

          // Handle tool calls - execute tools and return results
          if (message.toolCall?.functionCalls) {
            const toolCalls = message.toolCall.functionCalls;
            responseData.toolCalls.push(...toolCalls);
            isExecutingTools = true;

            // Execute each tool call
            for (const call of toolCalls) {
              const toolName = call.name;
              const toolArgs = call.args || {};
              const toolId = call.id || toolName;

              console.log(`\n  🔧 Tool call: ${toolName}`);
              if (verboseMode) {
                console.log(`     Args: ${JSON.stringify(toolArgs)}`);
              }

              try {
                // Build execution context (simplified for testing)
                const executionContext = {
                  clientId: 'voice-test',
                  args: toolArgs,
                  capabilities: { voice: true, messaging: false },
                  session: { isActive: true }
                };

                // Execute the tool
                const startTime = Date.now();
                const result = await toolRegistry.executeTool(toolName, executionContext);
                const duration = Date.now() - startTime;

                // Store result for display
                responseData.toolResults.push({
                  name: toolName,
                  args: toolArgs,
                  result: result,
                  duration: duration
                });

                // Display result summary
                if (result.ok) {
                  console.log(`     ✓ ${toolName} completed in ${duration}ms`);
                  if (verboseMode && result.data) {
                    const preview = JSON.stringify(result.data).substring(0, 200);
                    console.log(`     Data: ${preview}${preview.length >= 200 ? '...' : ''}`);
                  }
                } else {
                  console.log(`     ✗ ${toolName} failed: ${result.error?.message || 'Unknown error'}`);
                }

                // Send tool result back to Gemini
                const responseData_inner = result.ok ? result.data : result.error;
                const functionResponse = { name: toolName, response: responseData_inner };
                if (toolId && toolId !== toolName) {
                  functionResponse.id = toolId;
                }

                await session.sendToolResponse({
                  functionResponses: [functionResponse]
                });

                if (verboseMode) {
                  console.log(`     📤 Tool result sent to Gemini`);
                }

              } catch (error) {
                console.error(`     ✗ Tool execution error: ${error.message}`);
                // Send error response to unblock Gemini
                await session.sendToolResponse({
                  functionResponses: [{
                    name: toolName,
                    response: { error: error.message }
                  }]
                });
              }
            }
            isExecutingTools = false;
          }
        },
        onerror: (error) => {
          console.error('  ✗ Session error:', error.message || error);
          if (responseRejecter) {
            responseRejecter(error);
          }
          reject(error);
        },
        onclose: () => {
          if (verboseMode) {
            console.log('  ✓ Session closed');
          }
        }
      }
    }).then(s => {
      session = s;
    }).catch(reject);
  });
}

/**
 * Read and encode audio file
 * Returns base64-encoded PCM data (no WAV header) for Gemini Live API realtime input
 */
async function readAudioFile(audioFilePath) {
  const absolutePath = path.join(__dirname, audioFilePath);
  const audioBuffer = await readFile(absolutePath);

  // For raw PCM streaming: skip the 44-byte WAV header
  // Gemini expects raw PCM samples, not WAV container
  const pcmData = audioBuffer.subarray(44);
  return pcmData.toString('base64');
}

/**
 * Read full WAV file including header for content-based sending
 */
async function readFullAudioFile(audioFilePath) {
  const absolutePath = path.join(__dirname, audioFilePath);
  const audioBuffer = await readFile(absolutePath);
  return audioBuffer.toString('base64');
}

/**
 * Simulate real-time audio streaming by pacing chunks
 * This mimics how audio would arrive from a microphone
 */
async function streamAudioChunks(sessionHandler, base64Audio, onProgress) {
  // 16kHz mono 16-bit = 32000 bytes per second of raw audio
  // In base64: 32000 * 4/3 ≈ 42667 chars per second
  // Send in ~250ms chunks for realistic streaming
  const chunkSize = 10000; // ~250ms of audio in base64
  const totalChunks = Math.ceil(base64Audio.length / chunkSize);
  const msPerChunk = 250; // Time to wait between chunks

  for (let i = 0; i < totalChunks; i++) {
    const chunk = base64Audio.slice(i * chunkSize, (i + 1) * chunkSize);
    await sessionHandler.sendAudio(chunk);

    if (onProgress) {
      onProgress(i + 1, totalChunks);
    }

    // Pace the chunks to simulate real-time audio
    if (i < totalChunks - 1) {
      await new Promise(resolve => setTimeout(resolve, msPerChunk));
    }
  }

  return totalChunks;
}

/**
 * Process a single audio question
 */
async function processAudioQuestion(sessionHandler, audioQuestion, questionIndex = null, totalQuestions = null) {
  const questionStartTime = Date.now();

  // Display question header
  if (questionIndex !== null && totalQuestions !== null) {
    console.log(formatQuestionHeader(questionIndex + 1, totalQuestions, audioQuestion.text));
  } else {
    console.log(`\n${'━'.repeat(80)}\nQuestion: "${audioQuestion.text}"\nAudio: ${audioQuestion.audioFile}\n${'━'.repeat(80)}\n`);
  }

  try {
    // Reset response data for new question
    sessionHandler.resetResponseData();

    // Step 1: Send audio file
    console.log(formatStepHeader(1));
    console.log(`  🎤 Sending audio: ${audioQuestion.audioFile}`);

    if (useContentMode) {
      // Content mode: Send full WAV as a content turn (better for pre-recorded audio)
      const base64Audio = await readFullAudioFile(audioQuestion.audioFile);
      if (verboseMode) {
        console.log(`  📊 Audio size: ${base64Audio.length} base64 chars (~${Math.round(base64Audio.length * 0.75 / 1000)}KB)`);
        console.log('  📤 Sending audio as content turn...');
      }
      await sessionHandler.sendAudioAsContent(base64Audio);
      if (verboseMode) {
        console.log('  ✓ Audio sent as content (turnComplete included)');
      }
    } else {
      // Realtime mode: Stream audio chunks like a microphone would
      const base64Audio = await readAudioFile(audioQuestion.audioFile);
      if (verboseMode) {
        console.log(`  📊 Audio size: ${base64Audio.length} base64 chars (~${Math.round(base64Audio.length * 0.75 / 1000)}KB)`);
      }

      // Stream audio in real-time paced chunks
      await streamAudioChunks(
        sessionHandler,
        base64Audio,
        verboseMode ? (current, total) => {
          if (current === total) {
            console.log(`  📤 Streamed ${total} audio chunks`);
          }
        } : null
      );

      // Wait for VAD to detect end of speech after audio finishes
      const vadProcessingDelay = 600; // ms after audio ends
      await new Promise(resolve => setTimeout(resolve, vadProcessingDelay));

      // Signal turn complete so Gemini knows to respond
      await sessionHandler.signalTurnComplete();
      if (verboseMode) {
        console.log('  ✓ Signaled turnComplete');
      }
    }

    // Step 2: Wait for response
    console.log('  👂 Listening for response...');

    const response = await sessionHandler.waitForResponse(45000);

    const questionDuration = Date.now() - questionStartTime;
    testSummary.responses++;
    testSummary.questions++;

    // Display what Gemini heard
    if (response.inputTranscript) {
      console.log(`\n  📝 Gemini heard: "${response.inputTranscript}"`);
    }

    // Display transcript
    if (response.transcript) {
      console.log(formatFinalResponse(response.transcript));
      testSummary.successful++;
    } else if (response.audioChunks.length > 0) {
      console.log(`\n  🔊 Received ${response.audioChunks.length} audio chunks (no transcript available)`);
      testSummary.successful++;
    } else {
      console.log(formatError('No response received'));
      testSummary.failed++;
    }

    // Display tool calls with results (like text-agent-test)
    if (response.toolResults && response.toolResults.length > 0) {
      console.log(`\n  🔧 Tool calls executed: ${response.toolResults.length}`);
      response.toolResults.forEach((toolResult) => {
        testSummary.totalToolCalls++;
        const toolName = toolResult.name || 'unknown';

        // Track tool calls with count and duration (format expected by formatter)
        if (!testSummary.toolCalls[toolName]) {
          testSummary.toolCalls[toolName] = { count: 0, totalDuration: 0 };
        }
        testSummary.toolCalls[toolName].count++;
        testSummary.toolCalls[toolName].totalDuration += toolResult.duration || 0;
        testSummary.toolCalls[toolName].avgDuration =
          testSummary.toolCalls[toolName].totalDuration / testSummary.toolCalls[toolName].count;

        // Format using the shared formatter
        console.log(formatToolCall({
          toolId: toolName,
          args: toolResult.args,
          result: toolResult.result?.data || toolResult.result,
          duration: toolResult.duration
        }));
      });
    } else if (response.toolCalls.length > 0) {
      // Fallback if tools were called but not executed (no registry)
      console.log(`\n  🔧 Tool calls requested: ${response.toolCalls.length}`);
      response.toolCalls.forEach((toolCall, idx) => {
        console.log(`    ${idx + 1}. ${toolCall.name || 'unknown'} (not executed - no tool registry)`);
        testSummary.totalToolCalls++;
        const toolName = toolCall.name || 'unknown';

        if (!testSummary.toolCalls[toolName]) {
          testSummary.toolCalls[toolName] = { count: 0 };
        }
        testSummary.toolCalls[toolName].count++;
      });
    }

    // Track metrics
    testSummary.audioMetrics.totalAudioLatency += response.duration || 0;
    testSummary.totalDuration += questionDuration;

    console.log(`\n  ⏱️  Response time: ${response.duration || 0}ms`);
    console.log(`  ⏱️  Total time: ${questionDuration}ms\n`);

    console.log(`${'━'.repeat(80)}\n`);

    // Delay between questions to let the model settle
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    testSummary.responses++;
    testSummary.failed++;
    console.error(formatError(error.message));
    console.log(`\n${'━'.repeat(80)}\n`);
  }
}

/**
 * Non-interactive mode: Run pre-recorded test audio
 */
async function runNonInteractive() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     FRAM Voice Agent Test - Non-Interactive                     ║');
  console.log('║                      Using @google/genai SDK (Production Mode)                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  // Dynamically import VOICE_TEST_QUESTIONS
  let VOICE_TEST_QUESTIONS;
  try {
    const module = await import('./voice-agent-test-questions.js');
    VOICE_TEST_QUESTIONS = module.VOICE_TEST_QUESTIONS;
  } catch (error) {
    console.error(formatError('Could not load voice-agent-test-questions.js'));
    console.log('\nPlease run: node scripts/generate-test-audio.js');
    process.exit(1);
  }

  // Filter to single question if specified
  let questionsToRun = VOICE_TEST_QUESTIONS;
  if (singleQuestionId !== null) {
    questionsToRun = VOICE_TEST_QUESTIONS.filter(q => q.id === singleQuestionId);
    if (questionsToRun.length === 0) {
      console.error(formatError(`Question ${singleQuestionId} not found`));
      process.exit(1);
    }
    console.log(`Running single question: #${singleQuestionId}\n`);
  } else {
    console.log(`Loaded ${VOICE_TEST_QUESTIONS.length} test questions\n`);
  }

  if (verboseMode) {
    console.log('Verbose mode: ON\n');
  }

  // Create AI client
  console.log('Initializing AI client...');
  const ai = await createAIClient();

  // Create live session
  console.log('Establishing live session...\n');
  let sessionHandler;

  try {
    sessionHandler = await createLiveSession(ai);
    console.log('✓ Live session established\n');
  } catch (error) {
    console.error(formatError(`Failed to create live session: ${error.message}`));
    console.error('\nPossible causes:');
    console.error('  1. Invalid API key or Vertex AI credentials');
    console.error('  2. Model not available in your region');
    console.error('  3. Network connectivity issues');
    process.exit(1);
  }

  // Process each question
  for (let i = 0; i < questionsToRun.length; i++) {
    await processAudioQuestion(
      sessionHandler,
      questionsToRun[i],
      i,
      questionsToRun.length
    );
  }

  // Close session
  sessionHandler.close();

  // Display summary
  testSummary.totalDuration = Date.now() - testSummary.startTime;
  testSummary.audioMetrics.avgAudioLatency =
    testSummary.responses > 0
      ? testSummary.audioMetrics.totalAudioLatency / testSummary.responses
      : 0;

  console.log(formatTestSummary({
    ...testSummary,
    avgResponseTime: testSummary.responses > 0
      ? testSummary.totalDuration / testSummary.responses
      : 0
  }));
}

/**
 * Interactive mode: Live microphone input (placeholder)
 */
async function runInteractive() {
  console.error(formatError('Interactive mode not yet implemented'));
  console.log('\nInteractive mode requires microphone streaming, which is more complex.');
  console.log('For now, use --non-interactive mode with pre-recorded audio.\n');
  console.log('Contributions welcome! See: voice-server/server.js for microphone example.');
  process.exit(1);
}

/**
 * Main entry point
 */
async function main() {
  // Verify environment variables
  if (!process.env.GEMINI_API_KEY && !process.env.VERTEXAI_PROJECT) {
    console.error(formatError('Missing credentials'));
    console.log('\nPlease set one of:');
    console.log('  - GEMINI_API_KEY in .env.local or .env (Google AI Studio)');
    console.log('  - VERTEXAI_PROJECT in .env.local or .env (Vertex AI)');
    process.exit(1);
  }

  console.log('✓ Credentials found\n');

  // Run appropriate mode
  if (isNonInteractive) {
    await runNonInteractive();
  } else {
    await runInteractive();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nInterrupted. Displaying summary...');
  testSummary.totalDuration = Date.now() - testSummary.startTime;
  console.log(formatTestSummary(testSummary));
  process.exit(0);
});

main().catch((error) => {
  console.error(formatError(`Fatal error: ${error.message}`));
  if (verboseMode) {
    console.error(error.stack);
  }
  process.exit(1);
});
