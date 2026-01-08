/**
 * Tests for token estimation functions
 */

describe('Token Estimation', () => {
  const TOKENS_PER_CHAR = 0.25;

  function estimateTokens(text: string): number {
    return Math.ceil(text.length * TOKENS_PER_CHAR);
  }

  function estimateMessageTokens(messages: Array<{ role: string; parts: Array<{ text: string }> }>): number {
    let total = 0;
    for (const msg of messages) {
      for (const part of msg.parts) {
        total += estimateTokens(part.text);
      }
    }
    return total;
  }

  test('should estimate tokens correctly for simple text', () => {
    const text = 'Hello world';
    const tokens = estimateTokens(text);
    // 11 chars * 0.25 = 2.75, rounded up = 3
    expect(tokens).toBe(3);
  });

  test('should handle empty string', () => {
    const tokens = estimateTokens('');
    expect(tokens).toBe(0);
  });

  test('should handle long text', () => {
    const text = 'a'.repeat(1000);
    const tokens = estimateTokens(text);
    // 1000 chars * 0.25 = 250
    expect(tokens).toBe(250);
  });

  test('should round up correctly', () => {
    const text = 'abc'; // 3 chars * 0.25 = 0.75, rounded up = 1
    const tokens = estimateTokens(text);
    expect(tokens).toBe(1);
  });

  test('should estimate tokens for single message', () => {
    const messages = [
      {
        role: 'user',
        parts: [{ text: 'Hello, how are you?' }],
      },
    ];
    const tokens = estimateMessageTokens(messages);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(5); // 19 chars * 0.25 = 4.75, rounded up = 5
  });

  test('should estimate tokens for multiple messages', () => {
    const messages = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
      {
        role: 'model',
        parts: [{ text: 'Hi there!' }],
      },
    ];
    const tokens = estimateMessageTokens(messages);
    // 'Hello' = 5 chars * 0.25 = 1.25 = 2
    // 'Hi there!' = 9 chars * 0.25 = 2.25 = 3
    // Total = 5
    expect(tokens).toBe(5);
  });

  test('should handle messages with multiple parts', () => {
    const messages = [
      {
        role: 'user',
        parts: [
          { text: 'Part 1' },
          { text: 'Part 2' },
        ],
      },
    ];
    const tokens = estimateMessageTokens(messages);
    // 'Part 1' = 6 chars * 0.25 = 1.5 = 2
    // 'Part 2' = 6 chars * 0.25 = 1.5 = 2
    // Total = 4
    expect(tokens).toBe(4);
  });

  test('should handle empty messages array', () => {
    const messages: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    const tokens = estimateMessageTokens(messages);
    expect(tokens).toBe(0);
  });

  test('should respect MAX_TOKENS limit', () => {
    const MAX_TOKENS = 30000;
    const veryLongText = 'a'.repeat(MAX_TOKENS * 4 + 1000); // Exceeds limit
    const tokens = estimateTokens(veryLongText);
    
    expect(tokens).toBeGreaterThan(MAX_TOKENS);
    // This test verifies we can detect when we exceed the limit
  });
});
