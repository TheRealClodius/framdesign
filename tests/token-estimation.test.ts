/**
 * Tests for token estimation functions
 */

describe('Token Estimation', () => {
  const TOKENS_PER_CHAR = 0.25;
  const SUMMARY_WORD_LIMIT = 80;

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

  function trimToWords(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(" ") + "…";
  }

  function enforceTokenBudget(
    contents: Array<{ role: string; parts: Array<{ text: string }> }>,
    summary: string | null,
    maxTokens: number
  ): {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    summary: string | null;
    droppedMessages: number;
    summaryTrimmed: boolean;
  } {
    let adjustedContents = [...contents];
    let adjustedSummary = summary;
    let summaryTrimmed = false;
    let droppedMessages = 0;

    let tokens = estimateMessageTokens(adjustedContents);
    if (tokens <= maxTokens) {
      return { contents: adjustedContents, summary: adjustedSummary, droppedMessages, summaryTrimmed };
    }

    if (adjustedSummary) {
      const trimmed = trimToWords(adjustedSummary, SUMMARY_WORD_LIMIT);
      if (trimmed !== adjustedSummary) {
        adjustedSummary = trimmed;
        adjustedContents = adjustedContents.map((msg) => {
          if (msg.role === "user" && msg.parts?.[0]?.text?.startsWith("PREVIOUS CONVERSATION SUMMARY:")) {
            return {
              ...msg,
              parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${trimmed}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }]
            };
          }
          return msg;
        });
        summaryTrimmed = true;
        tokens = estimateMessageTokens(adjustedContents);
      }
    }

    while (tokens > maxTokens && adjustedContents.length > 1) {
      adjustedContents.shift();
      droppedMessages += 1;
      tokens = estimateMessageTokens(adjustedContents);
    }

    return { contents: adjustedContents, summary: adjustedSummary, droppedMessages, summaryTrimmed };
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

  test('should trim summary to fit token budget', () => {
    const longSummary = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const contents = [
      {
        role: 'user',
        parts: [{ text: `PREVIOUS CONVERSATION SUMMARY:\n\n${longSummary}\n\n---\n\nCONTINUING WITH RECENT MESSAGES:` }],
      },
      { role: 'user', parts: [{ text: 'Hi' }] },
    ];

    const result = enforceTokenBudget(contents, longSummary, 200); // Small budget to force trim but keep summary entry
    expect(result.summaryTrimmed).toBe(true);
    const trimmedWords = result.summary?.trim().split(/\s+/).length || 0;
    expect(trimmedWords).toBeLessThanOrEqual(SUMMARY_WORD_LIMIT);
    expect(result.contents[0].parts[0].text).toContain(result.summary || '');
  });

  test('should drop oldest messages when over budget', () => {
    const contents = [
      { role: 'user', parts: [{ text: 'a'.repeat(200) }] },
      { role: 'model', parts: [{ text: 'b'.repeat(200) }] },
      { role: 'user', parts: [{ text: 'c'.repeat(10) }] },
    ];

    const result = enforceTokenBudget(contents, null, 60);
    expect(result.droppedMessages).toBeGreaterThan(0);
    expect(result.contents.length).toBeGreaterThan(0);
    expect(estimateMessageTokens(result.contents)).toBeLessThanOrEqual(60);
  });
});
