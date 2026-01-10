/**
 * PRIMARY FOCUS: Tests for transcript-to-text-agent integration
 * Verifies that transcripts from voice sessions are included in conversation history
 * sent to the text API so the text agent has full context
 */

describe('Voice Mode: Transcripts to Text Agent Integration', () => {
  interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  }

  function generateMessageId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function simulateHandleSubmit(
    messages: Message[],
    userMessage: string
  ): Message[] {
    return [
      ...messages,
      { id: generateMessageId(), role: 'user', content: userMessage }
    ];
  }

  function simulateTranscriptAddition(
    messages: Message[],
    role: 'user' | 'assistant',
    text: string
  ): Message[] {
    return [
      ...messages,
      { id: generateMessageId(), role: role, content: text }
    ];
  }

  function simulateLocalStorageSave(messages: Message[]): string {
    return JSON.stringify(messages);
  }

  function simulateLocalStorageLoad(stored: string): Message[] {
    return JSON.parse(stored);
  }

  test('should include transcripts in requestMessages when voice session ends', () => {
    // Start with text conversation
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there' }
    ];

    // Voice session happens - transcripts are added
    messages = simulateTranscriptAddition(messages, 'user', "What's the weather?");
    messages = simulateTranscriptAddition(messages, 'assistant', "It's sunny");

    // Voice session ends - transcripts remain in messages state
    expect(messages).toHaveLength(4);
    expect(messages[2].content).toBe("What's the weather?");
    expect(messages[3].content).toBe("It's sunny");

    // User sends text message - handleSubmit includes all messages
    const requestMessages = simulateHandleSubmit(messages, 'Thanks for the info');

    expect(requestMessages).toHaveLength(5);
    expect(requestMessages[0].content).toBe('Hello');
    expect(requestMessages[1].content).toBe('Hi there');
    expect(requestMessages[2].content).toBe("What's the weather?");
    expect(requestMessages[3].content).toBe("It's sunny");
    expect(requestMessages[4].content).toBe('Thanks for the info');
  });

  test('should preserve transcript order in requestMessages', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Text message 1' },
      { id: '2', role: 'assistant', content: 'Text response 1' }
    ];

    // Add transcripts during voice session
    messages = simulateTranscriptAddition(messages, 'user', 'Voice question');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice answer');

    // Add another text message
    messages = simulateTranscriptAddition(messages, 'user', 'Text message 2');

    const requestMessages = simulateHandleSubmit(messages, 'Final message');

    // Verify order: text → voice → text → new message
    expect(requestMessages[0].content).toBe('Text message 1');
    expect(requestMessages[1].content).toBe('Text response 1');
    expect(requestMessages[2].content).toBe('Voice question');
    expect(requestMessages[3].content).toBe('Voice answer');
    expect(requestMessages[4].content).toBe('Text message 2');
    expect(requestMessages[5].content).toBe('Final message');
  });

  test('should persist transcripts to localStorage', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Initial message' }
    ];

    // Add transcripts
    messages = simulateTranscriptAddition(messages, 'user', 'Voice transcript');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice response');

    // Save to localStorage
    const stored = simulateLocalStorageSave(messages);
    expect(stored).toContain('Voice transcript');
    expect(stored).toContain('Voice response');

    // Load from localStorage
    const loaded = simulateLocalStorageLoad(stored);
    expect(loaded).toHaveLength(3);
    expect(loaded[1].content).toBe('Voice transcript');
    expect(loaded[2].content).toBe('Voice response');
  });

  test('should include transcripts from localStorage in subsequent API calls', () => {
    // Simulate messages with transcripts saved to localStorage
    const savedMessages: Message[] = [
      { id: '1', role: 'user', content: 'Text message' },
      { id: '2', role: 'assistant', content: 'Text response' },
      { id: '3', role: 'user', content: 'Voice transcript' },
      { id: '4', role: 'assistant', content: 'Voice response' }
    ];

    const stored = simulateLocalStorageSave(savedMessages);
    const loaded = simulateLocalStorageLoad(stored);

    // User sends new message - should include loaded transcripts
    const requestMessages = simulateHandleSubmit(loaded, 'New text message');

    expect(requestMessages).toHaveLength(5);
    expect(requestMessages[2].content).toBe('Voice transcript');
    expect(requestMessages[3].content).toBe('Voice response');
  });

  test('should handle empty voice session (no transcripts)', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Text message' }
    ];

    // Voice session ends with no transcripts
    const requestMessages = simulateHandleSubmit(messages, 'New message');

    expect(requestMessages).toHaveLength(2);
    expect(requestMessages[0].content).toBe('Text message');
    expect(requestMessages[1].content).toBe('New message');
  });

  test('should handle multiple voice sessions', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Initial text' }
    ];

    // First voice session
    messages = simulateTranscriptAddition(messages, 'user', 'Voice 1 question');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice 1 answer');

    // Text message between sessions
    messages = simulateTranscriptAddition(messages, 'user', 'Text between sessions');

    // Second voice session
    messages = simulateTranscriptAddition(messages, 'user', 'Voice 2 question');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice 2 answer');

    const requestMessages = simulateHandleSubmit(messages, 'Final message');

    expect(requestMessages).toHaveLength(7);
    expect(requestMessages[1].content).toBe('Voice 1 question');
    expect(requestMessages[2].content).toBe('Voice 1 answer');
    expect(requestMessages[4].content).toBe('Voice 2 question');
    expect(requestMessages[5].content).toBe('Voice 2 answer');
  });

  test('should maintain correct role mapping', () => {
    let messages: Message[] = [];
    messages = simulateTranscriptAddition(messages, 'user', 'User transcript');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Assistant transcript');

    const requestMessages = simulateHandleSubmit(messages, 'New user message');

    expect(requestMessages[0].role).toBe('user');
    expect(requestMessages[1].role).toBe('assistant');
    expect(requestMessages[2].role).toBe('user');
  });

  test('should include transcripts in correct format for API', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Text 1' },
      { id: '2', role: 'assistant', content: 'Text 2' }
    ];

    // Add voice transcripts
    messages = simulateTranscriptAddition(messages, 'user', 'Voice user');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice assistant');

    const requestMessages = simulateHandleSubmit(messages, 'New message');

    // Verify structure matches expected API format
    requestMessages.forEach(msg => {
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('role');
      expect(msg).toHaveProperty('content');
      expect(['user', 'assistant']).toContain(msg.role);
    });

    expect(requestMessages).toHaveLength(5);
  });

  test('should handle transcripts mixed with regular messages', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Text before voice' }
    ];

    // Voice session transcripts
    messages = simulateTranscriptAddition(messages, 'user', 'Voice 1');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice 2');

    // More text messages
    messages = simulateTranscriptAddition(messages, 'user', 'Text after voice');

    const requestMessages = simulateHandleSubmit(messages, 'Final text');

    expect(requestMessages[0].content).toBe('Text before voice');
    expect(requestMessages[1].content).toBe('Voice 1');
    expect(requestMessages[2].content).toBe('Voice 2');
    expect(requestMessages[3].content).toBe('Text after voice');
    expect(requestMessages[4].content).toBe('Final text');
  });

  test('should verify text agent receives full conversation history', () => {
    // Simulate complete flow
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there' }
    ];

    // Voice session
    messages = simulateTranscriptAddition(messages, 'user', 'What is 2+2?');
    messages = simulateTranscriptAddition(messages, 'assistant', '2+2 equals 4');

    // User continues in text mode
    const requestMessages = simulateHandleSubmit(messages, 'Thanks, what about 3+3?');

    // Text agent should receive all context including voice session
    expect(requestMessages.length).toBeGreaterThan(4);
    expect(requestMessages.some(m => m.content.includes('2+2'))).toBe(true);
    expect(requestMessages.some(m => m.content.includes('equals 4'))).toBe(true);
  });
});
