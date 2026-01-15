/**
 * Voice configuration constants
 */

// Sanitize WebSocket URL: trim whitespace and remove trailing slash
const sanitizeWebSocketUrl = (url: string | undefined): string => {
  if (!url) return 'ws://localhost:8080';
  const trimmed = url.trim();
  // Remove trailing slash if present
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const VOICE_CONFIG = {
  WEBSOCKET_URL: sanitizeWebSocketUrl(process.env.NEXT_PUBLIC_VOICE_SERVER_URL),
  AUDIO_FORMAT: {
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16
  },
  RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY: 1000,
  // Pitch shift configuration for deep voice effect
  // Negative values make voice deeper (e.g., -6 semitones = one octave down)
  // Positive values make voice higher
  // NOTE: Using playbackRate sounds synthetic. For better quality, use a deeper prebuilt voice.
  PITCH_SHIFT_SEMITONES: -4, // -4 semitones for a deeper polar bear voice
  ENABLE_PITCH_SHIFT: false // Disabled - sounds synthetic. Using deeper prebuilt voice instead.
};
