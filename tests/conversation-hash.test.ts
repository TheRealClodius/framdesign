/**
 * Tests for conversation hashing logic
 * Verifies that hashes are stable for the same conversation
 */

import { createHash } from 'crypto';

function hashConversation(messages: Array<{ role: string; content: string }>, timeoutExpired: boolean): string {
  const key = JSON.stringify({
    firstMessages: messages.slice(0, 3).map(m => ({ role: m.role, content: m.content.substring(0, 100) })),
    timeoutExpired
  });
  
  const hash = createHash('sha256').update(key).digest('hex');
  return hash.substring(0, 16);
}

describe('Conversation Hashing', () => {
  test('should generate same hash for same initial messages', () => {
    const messages1 = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    const messages2 = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    
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

  test('should generate same hash as conversation grows', () => {
    const messages1 = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ];
    
    const messages2 = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am fine' },
      { role: 'user', content: 'Great!' },
    ];
    
    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);
    
    // Hash should be stable as conversation grows (based on first 3 messages)
    // Both have same first 3 messages, so hash should be same
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

  test('should truncate long content in first messages', () => {
    const longContent = 'a'.repeat(200);
    const messages1 = [
      { role: 'user', content: longContent },
    ];
    
    // First 100 chars are same, rest is different
    // But hash function truncates to first 100 chars, so hashes should be same
    const messages2 = [
      { role: 'user', content: longContent.substring(0, 100) + 'different' },
    ];
    
    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);
    
    // Should only consider first 100 chars, so hashes should be the same
    expect(hash1).toBe(hash2);
  });

  test('should only consider first 3 messages', () => {
    const messages1 = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
      { role: 'assistant', content: 'Fourth' },
    ];
    
    const messages2 = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
      { role: 'assistant', content: 'Different fourth' },
    ];
    
    const hash1 = hashConversation(messages1, false);
    const hash2 = hashConversation(messages2, false);
    
    // Should be same because first 3 messages are identical
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
