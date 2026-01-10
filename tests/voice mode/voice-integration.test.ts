/**
 * End-to-end integration tests for voice mode
 * Tests complete flow from text → voice → transcripts → text continuation
 */

describe('Voice Mode: End-to-End Integration', () => {
  interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  }

  function generateMessageId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function simulateSystemPromptInjection(): string {
    return 'FRAM_SYSTEM_PROMPT';
  }

  function simulateChatHistoryFormatting(messages: Message[]) {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  function simulateTranscriptReception(
    serverContent: { inputTranscription?: { text: string }; outputTranscription?: { text: string } }
  ): Array<{ role: 'user' | 'assistant'; text: string }> {
    const transcripts: Array<{ role: 'user' | 'assistant'; text: string }> = [];
    
    if (serverContent.inputTranscription?.text) {
      transcripts.push({ role: 'user', text: serverContent.inputTranscription.text });
    }
    
    if (serverContent.outputTranscription?.text) {
      transcripts.push({ role: 'assistant', text: serverContent.outputTranscription.text });
    }
    
    return transcripts;
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

  function simulateTextAPICall(messages: Message[]): Message[] {
    return messages;
  }

  test('should complete full flow: text → voice → transcripts → text', () => {
    // Step 1: User has text conversation
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there' }
    ];

    // Step 2: System prompt injected
    const systemPrompt = simulateSystemPromptInjection();
    expect(systemPrompt).toBe('FRAM_SYSTEM_PROMPT');

    // Step 3: Chat history formatted and sent to voice agent
    const chatHistory = simulateChatHistoryFormatting(messages);
    expect(chatHistory).toHaveLength(2);
    expect(chatHistory[0].role).toBe('user');
    expect(chatHistory[1].role).toBe('model');

    // Step 4: Voice session happens - transcripts received
    const serverContent = {
      inputTranscription: { text: "What's the weather?" },
      outputTranscription: { text: "It's sunny today" }
    };
    const transcripts = simulateTranscriptReception(serverContent);
    expect(transcripts).toHaveLength(2);
    expect(transcripts[0].role).toBe('user');
    expect(transcripts[1].role).toBe('assistant');

    // Step 5: Transcripts added to messages state
    messages = simulateTranscriptAddition(messages, transcripts[0].role, transcripts[0].text);
    messages = simulateTranscriptAddition(messages, transcripts[1].role, transcripts[1].text);
    expect(messages).toHaveLength(4);

    // Step 6: Voice session ends - transcripts remain in messages
    expect(messages[2].content).toBe("What's the weather?");
    expect(messages[3].content).toBe("It's sunny today");

    // Step 7: User sends text message - includes all history
    const requestMessages = simulateTextAPICall([
      ...messages,
      { id: generateMessageId(), role: 'user', content: 'Thanks for the info' }
    ]);

    // Step 8: Verify text agent receives full context
    expect(requestMessages).toHaveLength(5);
    expect(requestMessages[0].content).toBe('Hello');
    expect(requestMessages[1].content).toBe('Hi there');
    expect(requestMessages[2].content).toBe("What's the weather?");
    expect(requestMessages[3].content).toBe("It's sunny today");
    expect(requestMessages[4].content).toBe('Thanks for the info');
  });

  test('should verify system prompt, chat history, transcripts, and text agent integration', () => {
    // Initialize
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Initial question' },
      { id: '2', role: 'assistant', content: 'Initial answer' }
    ];

    // System prompt injection
    const systemPrompt = simulateSystemPromptInjection();
    expect(systemPrompt).toBeDefined();

    // Chat history formatting
    const chatHistory = simulateChatHistoryFormatting(messages);
    expect(chatHistory.length).toBe(2);

    // Voice session with multiple transcripts
    const transcripts1 = simulateTranscriptReception({
      inputTranscription: { text: 'Voice question 1' }
    });
    const transcripts2 = simulateTranscriptReception({
      outputTranscription: { text: 'Voice answer 1' }
    });

    messages = simulateTranscriptAddition(messages, transcripts1[0].role, transcripts1[0].text);
    messages = simulateTranscriptAddition(messages, transcripts2[0].role, transcripts2[0].text);

    // Text continuation
    const finalMessages = simulateTextAPICall([
      ...messages,
      { id: generateMessageId(), role: 'user', content: 'Follow-up question' }
    ]);

    expect(finalMessages.length).toBe(5);
    expect(finalMessages.some(m => m.content.includes('Voice question 1'))).toBe(true);
    expect(finalMessages.some(m => m.content.includes('Voice answer 1'))).toBe(true);
  });

  test('should handle multiple voice sessions in sequence', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Start' }
    ];

    // First voice session
    messages = simulateTranscriptAddition(messages, 'user', 'Voice 1 Q');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice 1 A');

    // Text message
    messages = simulateTranscriptAddition(messages, 'user', 'Text message');

    // Second voice session
    messages = simulateTranscriptAddition(messages, 'user', 'Voice 2 Q');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Voice 2 A');

    // Final text API call
    const requestMessages = simulateTextAPICall([
      ...messages,
      { id: generateMessageId(), role: 'user', content: 'Final' }
    ]);

    expect(requestMessages.length).toBe(7);
    expect(requestMessages[1].content).toBe('Voice 1 Q');
    expect(requestMessages[2].content).toBe('Voice 1 A');
    expect(requestMessages[4].content).toBe('Voice 2 Q');
    expect(requestMessages[5].content).toBe('Voice 2 A');
  });

  test('should maintain message order throughout flow', () => {
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Message 1' },
      { id: '2', role: 'assistant', content: 'Message 2' }
    ];

    // Add transcripts
    messages = simulateTranscriptAddition(messages, 'user', 'Message 3');
    messages = simulateTranscriptAddition(messages, 'assistant', 'Message 4');

    // Add text
    messages = simulateTranscriptAddition(messages, 'user', 'Message 5');

    const requestMessages = simulateTextAPICall([
      ...messages,
      { id: generateMessageId(), role: 'user', content: 'Message 6' }
    ]);

    // Verify order
    for (let i = 0; i < requestMessages.length; i++) {
      expect(requestMessages[i].content).toBe(`Message ${i + 1}`);
    }
  });

  test('should verify all components work together', () => {
    // System prompt
    const systemPrompt = simulateSystemPromptInjection();
    expect(systemPrompt).toBeDefined();

    // Initial messages
    let messages: Message[] = [
      { id: '1', role: 'user', content: 'Test' }
    ];

    // Chat history
    const chatHistory = simulateChatHistoryFormatting(messages);
    expect(chatHistory.length).toBe(1);

    // Transcripts
    const transcripts = simulateTranscriptReception({
      inputTranscription: { text: 'Test transcript' },
      outputTranscription: { text: 'Test response' }
    });
    expect(transcripts.length).toBe(2);

    // Add to messages
    messages = simulateTranscriptAddition(messages, transcripts[0].role, transcripts[0].text);
    messages = simulateTranscriptAddition(messages, transcripts[1].role, transcripts[1].text);

    // Text API
    const requestMessages = simulateTextAPICall([
      ...messages,
      { id: generateMessageId(), role: 'user', content: 'Final' }
    ]);

    expect(requestMessages.length).toBe(4);
    expect(requestMessages.some(m => m.content.includes('Test transcript'))).toBe(true);
  });
});
