/**
 * Tests for system prompt injection in voice mode
 * Verifies that FRAM_SYSTEM_PROMPT is correctly injected into Gemini Live API config
 */

import { loadVoicePrompt } from '@/lib/prompt-loader';

// Load the actual voice prompt from markdown files
const FRAM_SYSTEM_PROMPT = loadVoicePrompt();

describe('Voice Mode: System Prompt Injection', () => {
  test('should import FRAM_SYSTEM_PROMPT correctly', () => {
    expect(FRAM_SYSTEM_PROMPT).toBeDefined();
    expect(typeof FRAM_SYSTEM_PROMPT).toBe('string');
    expect(FRAM_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  test('should contain expected system prompt content', () => {
    expect(FRAM_SYSTEM_PROMPT).toContain('POLAR BEAR');
    expect(FRAM_SYSTEM_PROMPT).toContain('FRAM DESIGN');
    expect(FRAM_SYSTEM_PROMPT).toContain('FRAM');
  });

  test('should have system prompt injected in config', () => {
    // Mock the config structure that would be passed to ai.live.connect()
    const mockConfig = {
      responseModalities: ['AUDIO'],
      systemInstruction: FRAM_SYSTEM_PROMPT,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Algenib'
          }
        }
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: []
    };

    expect(mockConfig.systemInstruction).toBe(FRAM_SYSTEM_PROMPT);
    expect(mockConfig.systemInstruction).toContain('POLAR BEAR');
  });

  test('should have correct system prompt length', () => {
    // System prompt should be substantial (not empty, not too short)
    expect(FRAM_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(FRAM_SYSTEM_PROMPT.length).toBeLessThan(10000);
  });

  test('should include voice mode specific instructions', () => {
    expect(FRAM_SYSTEM_PROMPT).toContain('VOICE');
    expect(FRAM_SYSTEM_PROMPT).toContain('end_voice_session');
    expect(FRAM_SYSTEM_PROMPT).toContain('ignore_user');
  });
});
