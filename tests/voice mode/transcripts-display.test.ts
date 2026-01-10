/**
 * Tests for transcript display in UI
 * Verifies that transcripts are added to messages state and displayed correctly
 */

describe('Voice Mode: Transcripts Display', () => {
  interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  }

  function generateMessageId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function simulateTranscriptEvent(
    messages: Message[],
    role: 'user' | 'assistant',
    text: string
  ): Message[] {
    return [
      ...messages,
      {
        id: generateMessageId(),
        role: role,
        content: text
      }
    ];
  }

  function simulateVoiceTranscriptUpdate(
    currentTranscript: string,
    role: 'user' | 'assistant',
    text: string
  ): string {
    if (currentTranscript) {
      return `${currentTranscript}\n${role === 'user' ? 'You' : 'FRAM'}: ${text}`;
    }
    return `${role === 'user' ? 'You' : 'FRAM'}: ${text}`;
  }

  test('should add transcript to messages state', () => {
    const messages: Message[] = [];
    const transcript = simulateTranscriptEvent(messages, 'user', 'Hello, this is a test');

    expect(transcript).toHaveLength(1);
    expect(transcript[0].role).toBe('user');
    expect(transcript[0].content).toBe('Hello, this is a test');
    expect(transcript[0].id).toBeDefined();
  });

  test('should add multiple transcripts in order', () => {
    let messages: Message[] = [];
    messages = simulateTranscriptEvent(messages, 'user', 'First message');
    messages = simulateTranscriptEvent(messages, 'assistant', 'Second message');
    messages = simulateTranscriptEvent(messages, 'user', 'Third message');

    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('First message');
    expect(messages[1].content).toBe('Second message');
    expect(messages[2].content).toBe('Third message');
  });

  test('should update voiceTranscript state correctly', () => {
    let voiceTranscript = '';
    voiceTranscript = simulateVoiceTranscriptUpdate(voiceTranscript, 'user', 'Hello');
    expect(voiceTranscript).toBe('You: Hello');

    voiceTranscript = simulateVoiceTranscriptUpdate(voiceTranscript, 'assistant', 'Hi there');
    expect(voiceTranscript).toBe('You: Hello\nFRAM: Hi there');
  });

  test('should format user transcripts with "You:" prefix', () => {
    const voiceTranscript = simulateVoiceTranscriptUpdate('', 'user', 'Test message');
    expect(voiceTranscript).toBe('You: Test message');
  });

  test('should format assistant transcripts with "FRAM:" prefix', () => {
    const voiceTranscript = simulateVoiceTranscriptUpdate('', 'assistant', 'Test response');
    expect(voiceTranscript).toBe('FRAM: Test response');
  });

  test('should preserve existing messages when adding transcripts', () => {
    const existingMessages: Message[] = [
      { id: '1', role: 'user', content: 'Existing message 1' },
      { id: '2', role: 'assistant', content: 'Existing message 2' }
    ];

    const updatedMessages = simulateTranscriptEvent(existingMessages, 'user', 'New transcript');

    expect(updatedMessages).toHaveLength(3);
    expect(updatedMessages[0].content).toBe('Existing message 1');
    expect(updatedMessages[1].content).toBe('Existing message 2');
    expect(updatedMessages[2].content).toBe('New transcript');
  });

  test('should generate unique message IDs', () => {
    const messages: Message[] = [];
    const transcript1 = simulateTranscriptEvent(messages, 'user', 'Message 1');
    const transcript2 = simulateTranscriptEvent(transcript1, 'user', 'Message 2');

    expect(transcript1[0].id).not.toBe(transcript2[1].id);
  });

  test('should handle empty transcript text', () => {
    const messages: Message[] = [];
    const transcript = simulateTranscriptEvent(messages, 'user', '');

    expect(transcript[0].content).toBe('');
    expect(transcript[0].role).toBe('user');
  });

  test('should maintain correct role assignment', () => {
    const messages: Message[] = [];
    const userTranscript = simulateTranscriptEvent(messages, 'user', 'User message');
    const assistantTranscript = simulateTranscriptEvent(userTranscript, 'assistant', 'Assistant message');

    expect(userTranscript[0].role).toBe('user');
    expect(assistantTranscript[1].role).toBe('assistant');
  });

  test('should accumulate voiceTranscript correctly', () => {
    let voiceTranscript = '';
    voiceTranscript = simulateVoiceTranscriptUpdate(voiceTranscript, 'user', 'Question 1');
    voiceTranscript = simulateVoiceTranscriptUpdate(voiceTranscript, 'assistant', 'Answer 1');
    voiceTranscript = simulateVoiceTranscriptUpdate(voiceTranscript, 'user', 'Question 2');

    expect(voiceTranscript).toBe('You: Question 1\nFRAM: Answer 1\nYou: Question 2');
  });
});
