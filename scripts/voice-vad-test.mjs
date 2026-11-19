#!/usr/bin/env node
// Test client for the voice-server VAD/audioStreamEnd fix.
// Streams a pre-recorded WAV via the same WebSocket protocol the
// browser uses, then waits for silence-timeout to auto-finalize
// the turn. Success = we receive inputTranscription + modelTurn
// + turn_complete, without ever sending an explicit stop signal.

import WebSocket from 'ws';
import { readFile } from 'node:fs/promises';

const URL = process.env.VOICE_WS_URL || 'wss://voice-service-production-17a5.up.railway.app/';
const WAV = process.argv[2] || '/Users/andreiclodius/Documents/Projects/framdesign/scripts/test-audio/02-who-is-frams-owner.wav';
const USER_ID = 'vad-fix-smoketest';

const SAMPLE_RATE = 16000;
const CHUNK_MS = 100;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000; // 16-bit mono
const CHUNK_BYTES = CHUNK_MS * BYTES_PER_MS;

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

const startTs = Date.now();
const log = (...args) => console.log(`[${((Date.now() - startTs) / 1000).toFixed(2)}s]`, ...args);

const got = {
  started: false,
  inputTranscript: '',
  outputTranscript: '',
  modelTurnAudioChunks: 0,
  turnComplete: false,
  errors: [],
};

const ws = new WebSocket(URL);

ws.on('open', async () => {
  log('WS open, sending start');
  ws.send(JSON.stringify({ type: 'start', userId: USER_ID, conversationHistory: [] }));
});

ws.on('message', (buf) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch {
    log('non-JSON message', buf.length, 'bytes');
    return;
  }

  switch (msg.type) {
    case 'started':
      got.started = true;
      log('✓ started, streaming audio…');
      streamAudio().catch((err) => {
        log('streamAudio error', err);
        ws.close();
      });
      break;
    case 'audio':
      got.modelTurnAudioChunks++;
      break;
    case 'transcript': {
      const role = msg.role || 'unknown';
      const text = msg.text || msg.data?.text || '';
      if (role === 'user') {
        got.inputTranscript += text;
        log(`  📝 user: "${text}"`);
      } else {
        got.outputTranscript += text;
        log(`  💬 assistant: "${text}"`);
      }
      break;
    }
    case 'turn_complete':
      got.turnComplete = true;
      log('✓ turn_complete');
      break;
    case 'stopped':
    case 'session_complete':
      log('session ended', msg.type);
      break;
    case 'error':
      got.errors.push(msg);
      log('❌ error from server:', msg.error, msg.details || '');
      break;
    default:
      log('msg:', msg.type);
  }
});

ws.on('close', (code, reason) => {
  log(`WS closed code=${code} reason=${reason.toString() || '(none)'}`);
  printSummary();
  process.exit(got.inputTranscript && got.modelTurnAudioChunks > 0 && got.turnComplete ? 0 : 1);
});

ws.on('error', (err) => {
  log('WS error', err.message);
});

async function streamAudio() {
  const wav = await readFile(WAV);
  const pcm = wav.subarray(44); // strip WAV header
  const totalChunks = Math.ceil(pcm.length / CHUNK_BYTES);
  log(`audio: ${pcm.length} bytes, ${totalChunks} chunks × ${CHUNK_MS}ms`);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_BYTES;
    const chunk = pcm.subarray(start, Math.min(start + CHUNK_BYTES, pcm.length));
    ws.send(JSON.stringify({ type: 'audio', data: chunk.toString('base64') }));
    await wait(CHUNK_MS);
  }
  log(`streamed ${totalChunks} chunks — now going silent, waiting for server silence-timeout to fire`);

  // Wait for the model to actually respond. We do NOT send an explicit
  // stop/turnComplete — the server's silence timer should signal to Gemini.
  // Success = model audio chunks arrive. Give 30s hard cap, and stop
  // ~3s after the last audio chunk (trailing transcript grace).
  const hardDeadline = Date.now() + 30_000;
  let lastAudioAt = 0;
  while (Date.now() < hardDeadline) {
    const before = got.modelTurnAudioChunks;
    await wait(300);
    if (got.modelTurnAudioChunks > before) lastAudioAt = Date.now();
    if (lastAudioAt > 0 && Date.now() - lastAudioAt > 3000) break;
  }
  log(`wait done — modelChunks=${got.modelTurnAudioChunks}, turnComplete=${got.turnComplete}`);
  ws.send(JSON.stringify({ type: 'stop' }));
  await wait(1000);
  ws.close();
}

function printSummary() {
  console.log('\n=== RESULT ===');
  console.log('started:          ', got.started);
  console.log('inputTranscript:  ', JSON.stringify(got.inputTranscript));
  console.log('outputTranscript: ', JSON.stringify(got.outputTranscript));
  console.log('modelAudioChunks: ', got.modelTurnAudioChunks);
  console.log('turnComplete:     ', got.turnComplete);
  console.log('errors:           ', got.errors);
}
