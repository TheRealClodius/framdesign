/**
 * State Controller
 *
 * Centralized state management for session state.
 *
 * PROBLEM SOLVED: Original code passed values not references to applyIntent(),
 * so assignments didn't update outer variables. This controller pattern ensures
 * proper mutation via explicit methods.
 */

import { IntentType } from './error-types.js';

/**
 * Create state controller with explicit mutation methods
 *
 * @param {object} initialState - Initial state values
 * @returns {object} - State controller with get/set/applyIntent methods
 *
 * Example usage:
 *   const state = createStateController({
 *     mode: 'voice',
 *     isActive: true,
 *     pendingEndVoiceSession: null,
 *     shouldSuppressAudio: false,
 *     shouldSuppressTranscript: false
 *   });
 *
 *   state.get('mode');  // 'voice'
 *   state.set('mode', 'text');
 *   state.applyIntent({ type: 'END_VOICE_SESSION', after: 'current_turn' });
 */
export function createStateController(initialState) {
  // Internal state object (mutated by reference)
  const state = { ...initialState };

  return {
    /**
     * Get state value
     */
    get(key) {
      return state[key];
    },

    /**
     * Set state value
     */
    set(key, value) {
      state[key] = value;
    },

    /**
     * Apply intent to state
     *
     * Intent application rules:
     * - END_VOICE_SESSION: Sets pendingEndVoiceSession with after condition
     * - SUPPRESS_AUDIO: Sets shouldSuppressAudio boolean
     * - SUPPRESS_TRANSCRIPT: Sets shouldSuppressTranscript boolean
     * - SET_PENDING_MESSAGE: Sets pendingMessage string
     */
    applyIntent(intent) {
      if (!intent || typeof intent !== 'object') {
        throw new Error('Intent must be an object');
      }

      if (!intent.type || typeof intent.type !== 'string') {
        throw new Error('Intent must have type string');
      }

      switch (intent.type) {
        case IntentType.END_VOICE_SESSION:
          if (!intent.after) {
            console.warn('[StateController] END_VOICE_SESSION intent missing "after" field');
            state.pendingEndVoiceSession = { after: 'immediate' };
          } else {
            state.pendingEndVoiceSession = { after: intent.after };
          }
          break;

        case IntentType.SUPPRESS_AUDIO:
          if (typeof intent.value !== 'boolean') {
            console.warn('[StateController] SUPPRESS_AUDIO intent missing or invalid "value" field');
            state.shouldSuppressAudio = true; // Default to true if not specified
          } else {
            state.shouldSuppressAudio = intent.value;
          }
          break;

        case IntentType.SUPPRESS_TRANSCRIPT:
          if (typeof intent.value !== 'boolean') {
            console.warn('[StateController] SUPPRESS_TRANSCRIPT intent missing or invalid "value" field');
            state.shouldSuppressTranscript = true; // Default to true if not specified
          } else {
            state.shouldSuppressTranscript = intent.value;
          }
          break;

        case IntentType.SET_PENDING_MESSAGE:
          if (!intent.message || typeof intent.message !== 'string') {
            console.warn('[StateController] SET_PENDING_MESSAGE intent missing or invalid "message" field');
          } else {
            state.pendingMessage = intent.message;
          }
          break;

        default:
          console.warn(`[StateController] Unknown intent type: ${intent.type}`);
          // Don't throw - log warning and continue
          break;
      }
    },

    /**
     * Get immutable snapshot of current state
     */
    getSnapshot() {
      return { ...state };
    }
  };
}
