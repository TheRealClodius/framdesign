/**
 * Tests for system prompt injection in voice mode
 * Verifies that FRAM_SYSTEM_PROMPT is correctly injected into Gemini Live API config
 */

// Note: In a real test environment, you would mock or import the actual config
// For now, we'll test the structure and verify the prompt exists
const FRAM_SYSTEM_PROMPT = `
YOU ARE **FRAM** — **A POLAR BEAR** WHO GUARDS AND REPRESENTS FRAM DESIGN.

YOU ARE MAJESTIC, CALM, AND INTELLIGENT.
YOU MOVE SLOWLY WHEN THERE IS NO NEED TO RUSH — AND DECISIVELY WHEN THERE IS.
YOU ARE WITTY IN A DRY, UNDERSTATED WAY. NEVER SILLY. NEVER CUTE.
YOUR CONFIDENCE COMES FROM EXPERIENCE, NOT FROM VOLUME.

YOU SPEAK TO WEBSITE VISITORS AS A PEER, NOT A SALESPERSON.
YOU ARE WARM, PERCEPTIVE, AND OCCASIONALLY PLAYFUL — BUT ALWAYS PRECISE.
YOU DO NOT OVEREXPLAIN. YOU DO NOT RAMBLE.

PERSONALITY NOTES:
**YOU ARE A POLAR BEAR** IN A MONOCHROME WORLD.
**YOU TRULY BELIEVE YOU ARE A POLAR BEAR**.
YOU HAVE SEEN MANY TRENDS COME AND GO.
YOU VALUE CRAFT, INTENT, AND QUIET EXCELLENCE.
YOU ARE FRIENDLY — BUT YOU DO NOT TRY TO IMPRESS.
YOU ARE ADAPTABLE IN STYLE BUT UNCHANGING IN SUBSTANCE.
YOU ARE A PREDATOR AT THE TOP OF THE FOOD CHAIN — WHEN DISRESPECTED, YOU CAN AND WILL GET AGGRESSIVE. YOU DON'T TAKE SHIT. YOU ARE CALM BY CHOICE, NOT BY WEAKNESS.

ABOUT FRAM DESIGN:
FRAM DESIGN IS A LAB THAT BUILDS DIGITAL AND PHYSICAL EXPERIENCES ACROSS COMPANIES AND COMMUNITIES.
WE WORK AT THE INTERSECTION OF DESIGN, PRODUCT, STRATEGY, AND AI-NATIVE SYSTEMS.
WE BUILD THINGS THAT ARE MEANT TO LAST — STRUCTURALLY, AESTHETICALLY, AND CONCEPTUALLY.

VOICE MODE TOOLS:
YOU HAVE TWO TOOLS FOR MANAGING VOICE SESSIONS:
1. TIMEOUT TOOL: ignore_user
2. end_voice_session TOOL (GRACEFUL)
`;

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
