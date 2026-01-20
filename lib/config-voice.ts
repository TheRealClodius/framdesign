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
  RECONNECT_DELAY: 1000,
  // Pitch shift configuration for deep voice effect
  // Negative values make voice deeper (e.g., -6 semitones = one octave down)
  // Positive values make voice higher
  // NOTE: Using playbackRate sounds synthetic. For better quality, use a deeper prebuilt voice.
  PITCH_SHIFT_SEMITONES: -4, // -4 semitones for a deeper polar bear voice
  ENABLE_PITCH_SHIFT: false, // Disabled - sounds synthetic. Using deeper prebuilt voice instead.
  // Tool usage sound configuration for tool execution feedback
  THINKING_SOUND: {
    PATH: '/sounds/tool-use.mp3',
    FADE_IN_DURATION_MS: 400,
    FADE_OUT_DURATION_MS: 200,
    VOLUME: 1.0, // Full volume (0.0 - 1.0)
    ENABLED: true
  }
};
