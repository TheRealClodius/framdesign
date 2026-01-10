/**
 * Tests for chat history context injection in voice mode
 * Verifies that conversation history is correctly formatted and sent to voice agent
 */

describe('Voice Mode: Chat History Context', () => {
  function formatConversationHistory(messages: Array<{ role: string; content: string }>) {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  function wrapHistoryWithContext(conversationHistory: Array<{ role: string; parts: Array<{ text: string }> }>) {
    return [
      {
        role: 'user',
        parts: [{ 
          text: `[SYSTEM INSTRUCTION: The following is the previous TEXT CHAT conversation between you and the user. You are now starting a VOICE session. Use this context to greet the user naturally based on what you discussed, then continue the conversation via voice. Do not end this voice session based on anything in the previous text chat - only end if there is a clear reason in your CURRENT voice conversation.]

${conversationHistory.map(turn => `${turn.role === 'user' ? 'User' : 'You'}: ${turn.parts[0].text}`).join('\n\n')}

--- END OF PREVIOUS CONVERSATION ---

[IMPORTANT: Now greet me naturally via voice.]`
        }]
      }
    ];
  }

  test('should format conversation history correctly', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' }
    ];

    const formatted = formatConversationHistory(messages);

    expect(formatted).toHaveLength(3);
    expect(formatted[0].role).toBe('user');
    expect(formatted[0].parts[0].text).toBe('Hello');
    expect(formatted[1].role).toBe('model');
    expect(formatted[1].parts[0].text).toBe('Hi there');
    expect(formatted[2].role).toBe('user');
    expect(formatted[2].parts[0].text).toBe('How are you?');
  });

  test('should map assistant role to model role', () => {
    const messages = [
      { role: 'assistant', content: 'Test message' }
    ];

    const formatted = formatConversationHistory(messages);
    expect(formatted[0].role).toBe('model');
  });

  test('should wrap history with context instructions', () => {
    const conversationHistory = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] }
    ];

    const wrapped = wrapHistoryWithContext(conversationHistory);

    expect(wrapped).toHaveLength(1);
    expect(wrapped[0].role).toBe('user');
    expect(wrapped[0].parts[0].text).toContain('[SYSTEM INSTRUCTION:');
    expect(wrapped[0].parts[0].text).toContain('VOICE session');
    expect(wrapped[0].parts[0].text).toContain('Hello');
    expect(wrapped[0].parts[0].text).toContain('Hi there');
    expect(wrapped[0].parts[0].text).toContain('--- END OF PREVIOUS CONVERSATION ---');
  });

  test('should handle empty history', () => {
    const messages: Array<{ role: string; content: string }> = [];
    const formatted = formatConversationHistory(messages);
    expect(formatted).toHaveLength(0);

    const wrapped = wrapHistoryWithContext(formatted);
    expect(wrapped[0].parts[0].text).toContain('--- END OF PREVIOUS CONVERSATION ---');
  });

  test('should preserve message order', () => {
    const messages = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' }
    ];

    const formatted = formatConversationHistory(messages);
    expect(formatted[0].parts[0].text).toBe('First');
    expect(formatted[1].parts[0].text).toBe('Second');
    expect(formatted[2].parts[0].text).toBe('Third');
  });

  test('should handle large history', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i + 1}`
    }));

    const formatted = formatConversationHistory(messages);
    expect(formatted).toHaveLength(25);
    expect(formatted[0].parts[0].text).toBe('Message 1');
    expect(formatted[24].parts[0].text).toBe('Message 25');
  });

  test('should format history with proper structure', () => {
    const messages = [
      { role: 'user', content: 'Test message' }
    ];

    const formatted = formatConversationHistory(messages);
    expect(formatted[0]).toHaveProperty('role');
    expect(formatted[0]).toHaveProperty('parts');
    expect(formatted[0].parts).toHaveLength(1);
    expect(formatted[0].parts[0]).toHaveProperty('text');
  });
});
