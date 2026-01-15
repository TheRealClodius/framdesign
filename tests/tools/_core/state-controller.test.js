/**
 * Unit tests for state-controller.js
 */

import { createStateController } from '../../../tools/_core/state-controller.js';
import { IntentType } from '../../../tools/_core/error-types.js';

describe('createStateController', () => {
  test('should create controller with initial state', () => {
    const initialState = {
      mode: 'voice',
      isActive: true,
      pendingEndVoiceSession: null,
      shouldSuppressAudio: false,
      shouldSuppressTranscript: false
    };
    
    const state = createStateController(initialState);
    
    expect(state.get('mode')).toBe('voice');
    expect(state.get('isActive')).toBe(true);
    expect(state.get('pendingEndVoiceSession')).toBe(null);
    expect(state.get('shouldSuppressAudio')).toBe(false);
    expect(state.get('shouldSuppressTranscript')).toBe(false);
  });

  test('should allow setting state values', () => {
    const state = createStateController({ mode: 'voice' });
    
    state.set('mode', 'text');
    expect(state.get('mode')).toBe('text');
    
    state.set('isActive', false);
    expect(state.get('isActive')).toBe(false);
  });

  test('should mutate state by reference', () => {
    const state = createStateController({ count: 0 });
    
    state.set('count', 1);
    expect(state.get('count')).toBe(1);
    
    state.set('count', 2);
    expect(state.get('count')).toBe(2);
  });
});

describe('applyIntent', () => {
  describe('END_VOICE_SESSION', () => {
    test('should set pendingEndVoiceSession with after field', () => {
      const state = createStateController({
        pendingEndVoiceSession: null
      });
      
      state.applyIntent({
        type: IntentType.END_VOICE_SESSION,
        after: 'current_turn'
      });
      
      expect(state.get('pendingEndVoiceSession')).toEqual({
        after: 'current_turn'
      });
    });

    test('should default to immediate if after missing', () => {
      const state = createStateController({
        pendingEndVoiceSession: null
      });
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      state.applyIntent({
        type: IntentType.END_VOICE_SESSION
      });
      
      expect(state.get('pendingEndVoiceSession')).toEqual({
        after: 'immediate'
      });
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('SUPPRESS_AUDIO', () => {
    test('should set shouldSuppressAudio to true', () => {
      const state = createStateController({
        shouldSuppressAudio: false
      });
      
      state.applyIntent({
        type: IntentType.SUPPRESS_AUDIO,
        value: true
      });
      
      expect(state.get('shouldSuppressAudio')).toBe(true);
    });

    test('should set shouldSuppressAudio to false', () => {
      const state = createStateController({
        shouldSuppressAudio: true
      });
      
      state.applyIntent({
        type: IntentType.SUPPRESS_AUDIO,
        value: false
      });
      
      expect(state.get('shouldSuppressAudio')).toBe(false);
    });

    test('should default to true if value missing', () => {
      const state = createStateController({
        shouldSuppressAudio: false
      });
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      state.applyIntent({
        type: IntentType.SUPPRESS_AUDIO
      });
      
      expect(state.get('shouldSuppressAudio')).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('SUPPRESS_TRANSCRIPT', () => {
    test('should set shouldSuppressTranscript to true', () => {
      const state = createStateController({
        shouldSuppressTranscript: false
      });
      
      state.applyIntent({
        type: IntentType.SUPPRESS_TRANSCRIPT,
        value: true
      });
      
      expect(state.get('shouldSuppressTranscript')).toBe(true);
    });

    test('should default to true if value missing', () => {
      const state = createStateController({
        shouldSuppressTranscript: false
      });
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      state.applyIntent({
        type: IntentType.SUPPRESS_TRANSCRIPT
      });
      
      expect(state.get('shouldSuppressTranscript')).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('SET_PENDING_MESSAGE', () => {
    test('should set pendingMessage', () => {
      const state = createStateController({
        pendingMessage: null
      });
      
      state.applyIntent({
        type: IntentType.SET_PENDING_MESSAGE,
        message: 'Hello world'
      });
      
      expect(state.get('pendingMessage')).toBe('Hello world');
    });

    test('should warn if message missing', () => {
      const state = createStateController({
        pendingMessage: null
      });
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      state.applyIntent({
        type: IntentType.SET_PENDING_MESSAGE
      });
      
      expect(state.get('pendingMessage')).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    test('should throw if intent is not an object', () => {
      const state = createStateController({});
      
      expect(() => state.applyIntent(null)).toThrow('Intent must be an object');
      expect(() => state.applyIntent(undefined)).toThrow('Intent must be an object');
      expect(() => state.applyIntent('string')).toThrow('Intent must be an object');
    });

    test('should throw if intent type is missing', () => {
      const state = createStateController({});
      
      expect(() => state.applyIntent({})).toThrow('Intent must have type string');
    });

    test('should warn for unknown intent type', () => {
      const state = createStateController({});
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      state.applyIntent({
        type: 'UNKNOWN_INTENT'
      });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown intent type')
      );
      
      consoleWarnSpy.mockRestore();
    });
  });
});

describe('getSnapshot', () => {
  test('should return immutable snapshot', () => {
    const state = createStateController({
      mode: 'voice',
      count: 0
    });
    
    const snapshot1 = state.getSnapshot();
    state.set('count', 1);
    const snapshot2 = state.getSnapshot();
    
    expect(snapshot1.count).toBe(0);
    expect(snapshot2.count).toBe(1);
    expect(snapshot1).not.toBe(snapshot2);
  });

  test('should return copy of state', () => {
    const state = createStateController({
      mode: 'voice'
    });
    
    const snapshot = state.getSnapshot();
    snapshot.mode = 'text';
    
    expect(state.get('mode')).toBe('voice'); // Original unchanged
  });
});
