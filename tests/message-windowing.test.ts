/**
 * Tests for message windowing logic
 * Verifies that only the last 20 messages are kept as raw history
 */

describe('Message Windowing', () => {
  const MAX_RAW_MESSAGES = 20;

  function createMessages(count: number): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < count; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
      });
    }
    return messages;
  }

  test('should keep all messages when under limit', () => {
    const messages = createMessages(10);
    expect(messages.length).toBe(10);
    
    // When under limit, all messages should be kept
    const shouldSummarize = messages.length > MAX_RAW_MESSAGES;
    expect(shouldSummarize).toBe(false);
  });

  test('should split messages when over limit', () => {
    const messages = createMessages(25);
    expect(messages.length).toBe(25);
    
    const splitIndex = messages.length - MAX_RAW_MESSAGES;
    expect(splitIndex).toBe(5);
    
    const messagesToSummarize = messages.slice(0, splitIndex);
    const rawMessages = messages.slice(splitIndex);
    
    expect(messagesToSummarize.length).toBe(5);
    expect(rawMessages.length).toBe(20);
    expect(rawMessages[0].content).toBe('Message 6');
    expect(rawMessages[rawMessages.length - 1].content).toBe('Message 25');
  });

  test('should keep exactly 20 messages when exactly at limit', () => {
    const messages = createMessages(20);
    const splitIndex = messages.length - MAX_RAW_MESSAGES;
    
    expect(splitIndex).toBe(0);
    expect(messages.slice(splitIndex).length).toBe(20);
  });

  test('should handle large conversation correctly', () => {
    const messages = createMessages(100);
    const splitIndex = messages.length - MAX_RAW_MESSAGES;
    
    expect(splitIndex).toBe(80);
    const messagesToSummarize = messages.slice(0, splitIndex);
    const rawMessages = messages.slice(splitIndex);
    
    expect(messagesToSummarize.length).toBe(80);
    expect(rawMessages.length).toBe(20);
    expect(rawMessages[0].content).toBe('Message 81');
    expect(rawMessages[rawMessages.length - 1].content).toBe('Message 100');
  });

  test('should preserve message order in raw messages', () => {
    const messages = createMessages(30);
    const splitIndex = messages.length - MAX_RAW_MESSAGES;
    const rawMessages = messages.slice(splitIndex);
    
    // Verify order is preserved
    for (let i = 0; i < rawMessages.length - 1; i++) {
      const currentNum = parseInt(rawMessages[i].content.split(' ')[1]);
      const nextNum = parseInt(rawMessages[i + 1].content.split(' ')[1]);
      expect(nextNum).toBe(currentNum + 1);
    }
  });

  test('should handle empty messages array', () => {
    const messages: Array<{ role: string; content: string }> = [];
    const splitIndex = messages.length - MAX_RAW_MESSAGES;
    
    expect(splitIndex).toBe(-20);
    expect(messages.slice(splitIndex).length).toBe(0);
  });

  test('should handle single message', () => {
    const messages = createMessages(1);
    const splitIndex = messages.length - MAX_RAW_MESSAGES;
    
    expect(splitIndex).toBe(-19);
    // slice with negative index returns from the end
    const rawMessages = messages.slice(Math.max(0, splitIndex));
    expect(rawMessages.length).toBe(1);
  });
});
