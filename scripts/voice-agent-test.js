#!/usr/bin/env node

/**
 * Voice Agent Test CLI Tool
 *
 * Tests the voice agent using Gemini Live API with complete observability.
 * Supports both non-interactive mode (pre-recorded audio) and interactive mode (microphone).
 */

import { config } from 'dotenv';
import WebSocket from 'ws';
import { readFile } from 'fs/promises';
import readline from 'readline';
import {
  formatQuestionHeader,
  formatStepHeader,
  formatFinalResponse,
  formatTestSummary,
  formatError
} from './text-agent-test-formatter.js';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

// Parse command line arguments
const args = process.argv.slice(2);
const isInteractive = args.includes('--interactive');
const isNonInteractive = args.includes('--non-interactive');
const verboseMode = args.includes('--verbose');

if (!isInteractive && !isNonInteractive) {
  console.error(formatError('Please specify --interactive or --non-interactive'));
  console.log('\nUsage:');
  console.log('  node scripts/voice-agent-test.js --non-interactive   # Run test audio files');
  console.log('  node scripts/voice-agent-test.js --interactive       # Live microphone input');
  console.log('\nOptions:');
  console.log('  --verbose                                            # Show detailed logs');
  console.log('\nNote: Run scripts/generate-test-audio.js first to create audio test files');
  process.exit(1);
}

// WebSocket endpoint
const WS_ENDPOINT = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;

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
 * Create WebSocket connection with session setup
 */
async function createSession() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_ENDPOINT);

    ws.on('open', () => {
      if (verboseMode) {
        console.log('✓ WebSocket connected\n');
      }

      // Send setup message
      const setupMessage = {
        setup: {
          model: 'models/gemini-2.0-flash-exp',
          generation_config: {
            temperature: 0.7,
            max_output_tokens: 2048
          },
          system_instruction: {
            parts: [{
              text: `You are FRAM's AI assistant. You have access to a knowledge base about FRAM Design, Andrei Clodius, and their projects. Be helpful, accurate, and concise.`
            }]
          }
        }
      };

      ws.send(JSON.stringify(setupMessage));

      if (verboseMode) {
        console.log('✓ Session setup sent\n');
      }

      resolve(ws);
    });

    ws.on('error', (error) => {
      reject(new Error(`WebSocket error: ${error.message}`));
    });

    ws.on('close', () => {
      if (verboseMode) {
        console.log('✗ WebSocket closed\n');
      }
    });
  });
}

/**
 * Send audio file to the API
 */
async function sendAudioFile(ws, audioFilePath) {
  try {
    // Read audio file
    const audioBuffer = await readFile(audioFilePath);
    const base64Audio = audioBuffer.toString('base64');

    // Send audio in chunks (Gemini Live API expects chunked audio)
    const chunkSize = 16000; // ~1 second of 16kHz audio
    const totalChunks = Math.ceil(base64Audio.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = base64Audio.slice(i * chunkSize, (i + 1) * chunkSize);

      const message = {
        realtime_input: {
          media_chunks: [{
            mime_type: 'audio/pcm',
            data: chunk
          }]
        }
      };

      ws.send(JSON.stringify(message));

      // Small delay between chunks
      if (i < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    if (verboseMode) {
      console.log(`  Sent ${totalChunks} audio chunks from ${audioFilePath}`);
    }

  } catch (error) {
    throw new Error(`Failed to send audio: ${error.message}`);
  }
}

/**
 * Listen for response from the API
 */
async function listenForResponse(ws, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const responseData = {
      transcript: '',
      audioChunks: [],
      toolCalls: [],
      complete: false,
      startTime: Date.now()
    };

    const timeoutId = setTimeout(() => {
      reject(new Error('Response timeout'));
    }, timeout);

    const messageHandler = (data) => {
      try {
        const response = JSON.parse(data.toString());

        if (verboseMode) {
          console.log('  Received:', JSON.stringify(response, null, 2).substring(0, 200));
        }

        // Handle server content (transcript + audio)
        if (response.serverContent) {
          const { modelTurn, turnComplete } = response.serverContent;

          if (modelTurn?.parts) {
            modelTurn.parts.forEach(part => {
              // Extract text transcript
              if (part.text) {
                responseData.transcript += part.text;
              }

              // Extract audio chunks
              if (part.inlineData?.data) {
                responseData.audioChunks.push(part.inlineData.data);
              }
            });
          }

          // Check if turn is complete
          if (turnComplete) {
            responseData.complete = true;
            responseData.duration = Date.now() - responseData.startTime;
            clearTimeout(timeoutId);
            ws.off('message', messageHandler);
            resolve(responseData);
          }
        }

        // Handle tool calls
        if (response.toolCall) {
          responseData.toolCalls.push(response.toolCall);
        }

        // Handle setup confirmation
        if (response.setupComplete) {
          if (verboseMode) {
            console.log('  Setup confirmed');
          }
        }

      } catch (error) {
        console.error('  Parse error:', error.message);
      }
    };

    ws.on('message', messageHandler);

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * Process a single audio question
 */
async function processAudioQuestion(ws, audioQuestion, questionIndex = null, totalQuestions = null) {
  const questionStartTime = Date.now();

  // Display question header
  if (questionIndex !== null && totalQuestions !== null) {
    console.log(formatQuestionHeader(questionIndex + 1, totalQuestions, audioQuestion.text));
  } else {
    console.log(`\n${'━'.repeat(80)}\nQuestion: "${audioQuestion.text}"\nAudio: ${audioQuestion.audioFile}\n${'━'.repeat(80)}\n`);
  }

  try {
    // Send audio file
    console.log(formatStepHeader(1));
    console.log(`  🎤 Sending audio: ${audioQuestion.audioFile}`);

    await sendAudioFile(ws, audioQuestion.audioFile);

    // Listen for response
    console.log('  👂 Listening for response...');

    const response = await listenForResponse(ws);

    const questionDuration = Date.now() - questionStartTime;
    testSummary.responses++;
    testSummary.questions++;

    // Display transcript
    if (response.transcript) {
      console.log(formatFinalResponse(response.transcript));
      testSummary.successful++;
    } else {
      console.log(formatError('No transcript received'));
      testSummary.failed++;
    }

    // Display tool calls
    if (response.toolCalls.length > 0) {
      console.log(`\n  🔧 Tool calls: ${response.toolCalls.length}`);
      response.toolCalls.forEach((toolCall, idx) => {
        console.log(`    ${idx + 1}. ${toolCall.functionCall?.name || 'unknown'}`);
        testSummary.totalToolCalls++;
      });
    }

    // Track metrics
    testSummary.audioMetrics.totalAudioLatency += response.duration;
    testSummary.totalDuration += questionDuration;

    console.log(`\n  ⏱️  Audio latency: ${response.duration}ms`);
    console.log(`  ⏱️  Total time: ${questionDuration}ms\n`);

    console.log(`${'━'.repeat(80)}\n`);

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
  console.log('Running non-interactive mode with pre-recorded audio questions...');

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

  console.log(`Loaded ${VOICE_TEST_QUESTIONS.length} test questions\n`);

  if (verboseMode) {
    console.log('Verbose mode: ON\n');
  }

  // Create WebSocket session
  console.log('Establishing WebSocket connection...');
  const ws = await createSession();

  // Wait for setup to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Process each question
  for (let i = 0; i < VOICE_TEST_QUESTIONS.length; i++) {
    await processAudioQuestion(
      ws,
      VOICE_TEST_QUESTIONS[i],
      i,
      VOICE_TEST_QUESTIONS.length
    );

    // Small delay between questions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Close WebSocket
  ws.close();

  // Display summary
  testSummary.totalDuration = Date.now() - testSummary.startTime;
  testSummary.audioMetrics.avgAudioLatency =
    testSummary.audioMetrics.totalAudioLatency / testSummary.responses;

  console.log(formatTestSummary({
    ...testSummary,
    avgResponseTime: testSummary.totalDuration / testSummary.responses
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
  if (!process.env.GEMINI_API_KEY) {
    console.error(formatError('GEMINI_API_KEY not set'));
    console.log('\nPlease set GEMINI_API_KEY in .env.local or .env');
    process.exit(1);
  }

  console.log('✓ GEMINI_API_KEY found\n');

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
  console.error(error.stack);
  process.exit(1);
});
