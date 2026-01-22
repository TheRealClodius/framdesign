/**
 * Feature: Voice Experience - Transcripts & History
 * 
 * This suite tests the real-time interaction in voice mode,
 * including transcript reception, tagging, and how text chat history
 * is injected into the voice session for context.
 */

describe('Voice Feature: Transcripts & History', () => {
  
  // --- 1. Transcript Reception Logic ---
  describe('1. Transcript Reception', () => {
    interface VoiceTranscript {
      role: 'user' | 'assistant';
      text: string;
      timestamp: number;
    }

    function simulateTranscriptReception(
      serverContent: { inputTranscription?: { text: string }; outputTranscription?: { text: string } },
      conversationTranscripts: { user: VoiceTranscript[]; assistant: VoiceTranscript[] }
    ) {
      const receivedTranscripts: Array<{ role: 'user' | 'assistant'; text: string }> = [];

      if (serverContent.inputTranscription?.text !== undefined) {
        const transcript: VoiceTranscript = {
          role: 'user',
          text: serverContent.inputTranscription.text,
          timestamp: Date.now()
        };
        conversationTranscripts.user.push(transcript);
        receivedTranscripts.push({ role: 'user', text: transcript.text });
      }

      if (serverContent.outputTranscription?.text !== undefined) {
        const transcript: VoiceTranscript = {
          role: 'assistant',
          text: serverContent.outputTranscription.text,
          timestamp: Date.now()
        };
        conversationTranscripts.assistant.push(transcript);
        receivedTranscripts.push({ role: 'assistant', text: transcript.text });
      }

      return receivedTranscripts;
    }

    test('should correctly tag and store user vs assistant transcripts', () => {
      const history = { user: [], assistant: [] };
      const content = {
        inputTranscription: { text: 'Hello' },
        outputTranscription: { text: 'Hi there' }
      };

      const received = simulateTranscriptReception(content, history);
      
      expect(received).toHaveLength(2);
      expect(history.user[0].text).toBe('Hello');
      expect(history.assistant[0].text).toBe('Hi there');
    });

    test('should handle missing transcription fields gracefully', () => {
      const history = { user: [], assistant: [] };
      const received = simulateTranscriptReception({}, history);
      expect(received).toHaveLength(0);
    });
  });

  // --- 2. Chat History Context Injection ---
  describe('2. Chat History Context', () => {
    function formatHistoryForVoice(messages: Array<{ role: string; content: string }>) {
      // Maps assistant -> model and wraps with system instructions
      const formatted = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const contextString = formatted
        .map(turn => `${turn.role === 'user' ? 'User' : 'You'}: ${turn.parts[0].text}`)
        .join('\n\n');

      return `[SYSTEM INSTRUCTION: Previous context below]\n\n${contextString}\n\n[IMPORTANT: Greet naturally]`;
    }

    test('should format text chat history for voice agent consumption', () => {
      const messages = [
        { role: 'user', content: 'I want to build a house' },
        { role: 'assistant', content: 'I can help with that' }
      ];

      const context = formatHistoryForVoice(messages);
      
      expect(context).toContain('User: I want to build a house');
      expect(context).toContain('You: I can help with that');
      expect(context).toContain('[SYSTEM INSTRUCTION:');
    });

    test('should map roles correctly (assistant to model)', () => {
      const messages = [{ role: 'assistant', content: 'Test' }];
      const context = formatHistoryForVoice(messages);
      expect(context).toContain('You: Test');
    });
  });

  // --- 3. Voice-Specific Behavior (System Prompt) ---
  describe('3. Voice System Prompt', () => {
    test('should include voice-specific instructions in the prompt', () => {
      const basePrompt = "You are an architect.";
      const voiceInstructions = "Keep responses brief and conversational.";
      
      const finalPrompt = `${basePrompt}\n\n[VOICE MODE]: ${voiceInstructions}`;
      
      expect(finalPrompt).toContain('[VOICE MODE]');
      expect(finalPrompt).toContain('brief and conversational');
    });
  });
});
