/**
 * Voice configuration constants
 */

export const VOICE_CONFIG = {
  WEBSOCKET_URL: process.env.NEXT_PUBLIC_VOICE_SERVER_URL || 'ws://localhost:8080',
  AUDIO_FORMAT: {
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16
  },
  RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY: 1000
};
