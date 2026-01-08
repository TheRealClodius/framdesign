/**
 * Tests for conversation hashing logic
 * Verifies that hashes are stable for the same conversation
 */

import { createHash } from 'crypto';

function hashConversation(messages: Array<{ role: string; content: string }>, timeoutExpired: boolean): string {
  const firstMessages = messages.slice(0, 5).map(m => ({
    role: m.role,
    content: m.content.substring(0, 500)
  }));
  const key = JSON.stringify({
    firstMessages,
    timeoutExpired
  });

  const hash = createHash('sha256').update(key).digest('hex');
  return hash.substring(0, 16);
}

describe('Conversation Hashing', () => {
  test('should generate same hash for identical first 5 messages', () => {
    const firstFive = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'Doing well' },
      { role: 'user', content: 'Great to hear' },
    ];
    const messages1 = [...firstFive];
    const messages2 = [...firstFive, { role: 'assistant', content: 'Extra message beyond first 5' }];

    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);

    expect(hash1).toBe(hash2);
  });

  test('should generate different hash when timeout state changes', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const hash1 = hashConversation(messages, false);
    const hash2 = hashConversation(messages, true);

    expect(hash1).not.toBe(hash2);
  });

  test('should generate same hash as conversation grows when first 5 unchanged', () => {
    const messages1 = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am fine' },
      { role: 'user', content: 'Great!' },
    ];

    const messages2 = [
      ...messages1,
      { role: 'assistant', content: 'Adding later message 1' },
      { role: 'user', content: 'Adding later message 2' },
    ];

    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);

    expect(hash1).toBe(hash2);
  });

  test('should generate different hash for different initial messages', () => {
    const messages1 = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const messages2 = [
      { role: 'user', content: 'Goodbye' },
      { role: 'assistant', content: 'See you' },
    ];

    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);

    expect(hash1).not.toBe(hash2);
  });

  test('should handle empty messages array', () => {
    const messages: Array<{ role: string; content: string }> = [];
    const hash = hashConversation(messages, false);
    
    expect(hash).toBeDefined();
    expect(hash.length).toBe(16);
  });

  test('should truncate long content in first messages to 500 chars', () => {
    const longContent = 'a'.repeat(600);
    const messages1 = [
      { role: 'user', content: longContent },
    ];

    const messages2 = [
      { role: 'user', content: longContent.substring(0, 500) + 'DIFFERENT_TAIL' },
    ];

    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);

    expect(hash1).toBe(hash2);
  });

  test('should only consider first 5 messages', () => {
    const base = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
      { role: 'assistant', content: 'Fourth' },
      { role: 'user', content: 'Fifth' },
    ];

    const messages1 = [...base, { role: 'assistant', content: 'Sixth' }];
    const messages2 = [...base, { role: 'assistant', content: 'Different sixth' }];

    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);

    expect(hash1).toBe(hash2);
  });

  test('should generate consistent hash format', () => {
    const messages = [
      { role: 'user', content: 'Test' },
    ];

    const hash = hashConversation(messages, false);

    expect(hash).toMatch(/^[a-f0-9]{16}$/); // 16 hex characters
  });
});
