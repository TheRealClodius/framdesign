#!/usr/bin/env node

/**
 * Generate Test Audio Files
 *
 * Converts TEST_QUESTIONS to audio files using Google Cloud Text-to-Speech
 * for automated voice agent testing with Gemini Live API.
 *
 * Output format: 16kHz, mono, PCM16 (.wav) - compatible with Gemini Live API
 */

import { config } from 'dotenv';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEST_QUESTIONS } from './text-agent-test-questions.js';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory for test audio files
const OUTPUT_DIR = path.join(__dirname, 'test-audio');

// Voice configuration (high-quality neural voice)
const VOICE_CONFIG = {
  languageCode: 'en-US',
  name: 'en-US-Neural2-J', // Male voice - change to Neural2-C for female
  ssmlGender: 'MALE'
};

// Audio configuration (Gemini Live API requirements)
const AUDIO_CONFIG = {
  audioEncoding: 'LINEAR16', // PCM16
  sampleRateHertz: 16000,     // 16kHz
  pitch: 0,                   // Natural pitch
  speakingRate: 1.0          // Natural speed
};

/**
 * Initialize Text-to-Speech client
 */
function initializeTTSClient() {
  // Check if credentials are provided as JSON string
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      // Try to parse as JSON (inline credentials)
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      console.log('✓ Using inline Google Cloud credentials\n');
      return new TextToSpeechClient({ credentials });
    } catch (e) {
      // Not JSON, assume it's a file path
      console.log('✓ Using Google Cloud credentials from file\n');
      return new TextToSpeechClient();
    }
  }

  // Fall back to Application Default Credentials
  if (!process.env.GCP_PROJECT_ID) {
    console.warn('⚠️  Warning: No Google Cloud credentials found.');
    console.warn('   Set GOOGLE_APPLICATION_CREDENTIALS or GCP_PROJECT_ID');
    console.warn('   The script will attempt to use Application Default Credentials.\n');
  }

  return new TextToSpeechClient();
}

/**
 * Generate filename from question text
 */
function generateFilename(questionText, index) {
  // Create descriptive filename from question
  const slug = questionText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  const paddedIndex = String(index + 1).padStart(2, '0');
  return `${paddedIndex}-${slug}.wav`;
}

/**
 * Generate audio for a single question
 */
async function generateQuestionAudio(client, questionText, index, total) {
  const filename = generateFilename(questionText, index);
  const outputPath = path.join(OUTPUT_DIR, filename);

  console.log(`[${index + 1}/${total}] Generating: ${filename}`);
  console.log(`  Question: "${questionText}"`);

  try {
    // Prepare the synthesis request
    const request = {
      input: { text: questionText },
      voice: VOICE_CONFIG,
      audioConfig: AUDIO_CONFIG
    };

    // Perform text-to-speech request
    const [response] = await client.synthesizeSpeech(request);

    // Write audio file
    await writeFile(outputPath, response.audioContent, 'binary');

    console.log(`  ✓ Saved: ${filename}\n`);

    return {
      index: index + 1,
      text: questionText,
      audioFile: `test-audio/${filename}`,
      filename: filename,
      success: true
    };

  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}\n`);
    return {
      index: index + 1,
      text: questionText,
      audioFile: null,
      filename: filename,
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate voice test questions configuration file
 */
async function generateConfigFile(results) {
  const successfulResults = results.filter(r => r.success);

  const config = `/**
 * Voice Agent Test Questions
 *
 * Auto-generated audio files for voice agent testing
 * Generated on: ${new Date().toISOString()}
 *
 * Audio format: 16kHz, mono, PCM16 (.wav)
 * Compatible with: Gemini Live API
 */

export const VOICE_TEST_QUESTIONS = [
${successfulResults.map(r => `  {
    id: ${r.index},
    text: "${r.text}",
    audioFile: "${r.audioFile}"
  }`).join(',\n')}
];

// Mapping for quick lookup
export const VOICE_TEST_QUESTIONS_MAP = new Map(
  VOICE_TEST_QUESTIONS.map(q => [q.id, q])
);
`;

  const configPath = path.join(__dirname, 'voice-agent-test-questions.js');
  await writeFile(configPath, config, 'utf-8');

  console.log(`\n✓ Generated config: voice-agent-test-questions.js`);
}

/**
 * Main execution
 */
async function main() {
  console.log('━'.repeat(80));
  console.log('Generate Test Audio Files for Voice Agent Testing');
  console.log('━'.repeat(80));
  console.log(`\nQuestions to process: ${TEST_QUESTIONS.length}`);
  console.log(`Voice: ${VOICE_CONFIG.name}`);
  console.log(`Audio format: ${AUDIO_CONFIG.sampleRateHertz}Hz, ${AUDIO_CONFIG.audioEncoding}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Create output directory if it doesn't exist
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`✓ Created directory: ${OUTPUT_DIR}\n`);
  }

  // Initialize TTS client
  const client = initializeTTSClient();

  // Generate audio for each question
  const results = [];
  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const result = await generateQuestionAudio(
      client,
      TEST_QUESTIONS[i],
      i,
      TEST_QUESTIONS.length
    );
    results.push(result);

    // Delay to avoid rate limiting (2 seconds between requests)
    if (i < TEST_QUESTIONS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Generate configuration file
  await generateConfigFile(results);

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n' + '━'.repeat(80));
  console.log('Summary');
  console.log('━'.repeat(80));
  console.log(`Total questions: ${TEST_QUESTIONS.length}`);
  console.log(`✓ Successful: ${successful}`);
  if (failed > 0) {
    console.log(`✗ Failed: ${failed}`);
    console.log('\nFailed questions:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.text}: ${r.error}`);
    });
  }
  console.log(`\nAudio files saved to: ${OUTPUT_DIR}`);
  console.log('━'.repeat(80));

  // Exit with error code if any failed
  if (failed > 0) {
    process.exit(1);
  }
}

// Handle errors
main().catch((error) => {
  console.error('\n✗ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
