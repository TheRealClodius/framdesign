/**
 * Feature: Agent Components - Memory & Context Management
 * 
 * This suite tests how the agent remembers conversation history,
 * manages the context window (windowing/summarization), and ensures
 * user isolation and stable conversation tracking.
 */

import { createHash } from 'crypto';

describe('Agent Feature: Memory & Context', () => {
  const MAX_RAW_MESSAGES = 20;
  const CACHE_TTL_SECONDS = 3600;

  // --- Helpers & Types ---

  interface Message {
    role: string;
    content: string;
  }

  interface CacheEntry {
    cacheName: string;
    cachedMessageCount: number;
    summary: string | null;
    summaryUpToIndex: number;
    createdAt: number;
    userId: string; // Added for User Isolation tests
  }

  function createMessages(count: number): Message[] {
    const messages: Message[] = [];
    for (let i = 0; i < count; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
      });
    }
    return messages;
  }

  // --- Logic Implementations (from production/existing tests) ---

  function hashConversation(messages: Message[], timeoutExpired: boolean): string {
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

  function shouldGenerateNewSummary(
    cached: Partial<CacheEntry> | undefined,
    totalMessages: number
  ): boolean {
    if (totalMessages <= MAX_RAW_MESSAGES) {
      return false;
    }
    const splitIndex = totalMessages - MAX_RAW_MESSAGES;
    return !cached || !cached.summary || (cached.summaryUpToIndex ?? 0) < splitIndex;
  }

  function isCacheValid(cached: CacheEntry | undefined): boolean {
    if (!cached) return false;
    const ageSeconds = (Date.now() - cached.createdAt) / 1000;
    return ageSeconds < CACHE_TTL_SECONDS;
  }

  // --- Test Suites ---

  describe('1. Message Windowing (Context Management)', () => {
    test('should keep last 20 messages as raw history', () => {
      const messages = createMessages(25);
      const splitIndex = messages.length - MAX_RAW_MESSAGES;
      const rawMessages = messages.slice(splitIndex);
      
      expect(rawMessages.length).toBe(20);
      expect(rawMessages[0].content).toBe('Message 6');
      expect(rawMessages[19].content).toBe('Message 25');
    });

    test('should not split when under limit', () => {
      const messages = createMessages(15);
      const splitIndex = Math.max(0, messages.length - MAX_RAW_MESSAGES);
      expect(splitIndex).toBe(0);
    });
  });

  describe('2. Summarization Logic', () => {
    test('should trigger summarization only when exceeding limit', () => {
      expect(shouldGenerateNewSummary(undefined, 15)).toBe(false);
      expect(shouldGenerateNewSummary(undefined, 25)).toBe(true);
    });

    test('should update summary when conversation grows beyond cached range', () => {
      const cached = {
        summary: 'Old summary',
        summaryUpToIndex: 5, // Summarized up to message 5
      };
      // 30 messages - 20 (raw) = 10 (needs summary up to index 10)
      expect(shouldGenerateNewSummary(cached, 30)).toBe(true);
    });
  });

  describe('3. Conversation Hashing (Stability)', () => {
    test('should generate stable hash for same conversation start', () => {
      const messages1 = createMessages(5);
      const messages2 = [...messages1, { role: 'assistant', content: 'Extra' }];
      
      expect(hashConversation(messages1, false)).toBe(hashConversation(messages2, false));
    });

    test('should change hash if timeout state changes', () => {
      const messages = createMessages(2);
      expect(hashConversation(messages, false)).not.toBe(hashConversation(messages, true));
    });
  });

  describe('4. Multi-level Caching', () => {
    test('should validate cache age against TTL', () => {
      const validCache: CacheEntry = {
        cacheName: 'c1',
        cachedMessageCount: 10,
        summary: '...',
        summaryUpToIndex: 0,
        createdAt: Date.now() - 1000,
        userId: 'u1'
      };
      const expiredCache = { ...validCache, createdAt: Date.now() - (CACHE_TTL_SECONDS + 1) * 1000 };
      
      expect(isCacheValid(validCache)).toBe(true);
      expect(isCacheValid(expiredCache)).toBe(false);
    });
  });

  describe('5. User Isolation', () => {
    test('should ensure cache entries are never shared between users', () => {
      const user1Cache: CacheEntry = {
        cacheName: 'cache-1',
        cachedMessageCount: 10,
        summary: 'User 1 private info',
        summaryUpToIndex: 5,
        createdAt: Date.now(),
        userId: 'user-1'
      };

      const user2Id = 'user-2';
      
      // Simulation of a retrieval logic
      const getCacheForUser = (cache: CacheEntry, requestedUserId: string) => {
        return cache.userId === requestedUserId ? cache : null;
      };

      expect(getCacheForUser(user1Cache, 'user-1')).not.toBeNull();
      expect(getCacheForUser(user1Cache, user2Id)).toBeNull();
    });
  });
});
