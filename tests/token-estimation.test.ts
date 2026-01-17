/**
 * Tests for token estimation functions using tiktoken
 */

import { estimateTokens, estimateMessageTokens } from '@/lib/token-count';

describe('Token Estimation', () => {
  const SUMMARY_WORD_LIMIT = 80;

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
    // tiktoken will give accurate count (typically 2-3 tokens for "Hello world")
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test('should handle empty string', () => {
    const tokens = estimateTokens('');
    expect(tokens).toBe(0);
  });

  test('should handle long text', () => {
    const text = 'a'.repeat(1000);
    const tokens = estimateTokens(text);
    // tiktoken will give accurate count (typically around 250-300 tokens for 1000 'a' chars)
    expect(tokens).toBeGreaterThan(200);
    expect(tokens).toBeLessThan(400);
  });

  test('should count tokens for short text', () => {
    const text = 'abc';
    const tokens = estimateTokens(text);
    // tiktoken will give accurate count (typically 1-2 tokens)
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(5);
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
    // tiktoken will give accurate count (typically 4-6 tokens)
    expect(tokens).toBeLessThan(10);
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
    // tiktoken will give accurate count (typically 3-5 tokens total)
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
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
    // tiktoken will give accurate count (typically 2-4 tokens)
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test('should handle empty messages array', () => {
    const messages: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    const tokens = estimateMessageTokens(messages);
    expect(tokens).toBe(0);
  });

  test('should respect MAX_TOKENS limit', () => {
    const MAX_TOKENS = 30000;
    // Create text that will exceed limit (using tiktoken's more accurate counting)
    // For tiktoken, ~4 chars per token is still a reasonable approximation for this test
    const veryLongText = 'a'.repeat(MAX_TOKENS * 4 + 1000);
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
