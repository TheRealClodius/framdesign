import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConversationCache, type ConversationCacheEntry } from '../../lib/services/conversation-cache';

describe('ConversationCache', () => {
  const baseEntry: ConversationCacheEntry = {
    cacheName: 'cache-1',
    cachedMessageCount: 2,
    summary: null,
    summaryUpToIndex: 0,
    createdAt: 0,
    lastAccess: 0
  };

  let nowSpy: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now');
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  test('expires entries after TTL', () => {
    nowSpy.mockReturnValue(0);
    const cache = new ConversationCache({ ttlSeconds: 1, maxEntries: 10 });
    cache.set('a', { ...baseEntry, createdAt: Date.now(), lastAccess: Date.now() });

    nowSpy.mockReturnValue(1500);
    expect(cache.get('a')).toBeNull();
  });

  test('evicts least-recently-used when max entries exceeded', () => {
    nowSpy.mockReturnValue(0);
    const cache = new ConversationCache({ ttlSeconds: 60, maxEntries: 2 });
    cache.set('a', { ...baseEntry, cacheName: 'a', createdAt: Date.now(), lastAccess: Date.now() });

    nowSpy.mockReturnValue(10);
    cache.set('b', { ...baseEntry, cacheName: 'b', createdAt: Date.now(), lastAccess: Date.now() });

    nowSpy.mockReturnValue(20);
    cache.get('a'); // touch a to make it most recent

    nowSpy.mockReturnValue(30);
    cache.set('c', { ...baseEntry, cacheName: 'c', createdAt: Date.now(), lastAccess: Date.now() });

    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });

  test('access updates LRU ordering', () => {
    nowSpy.mockReturnValue(0);
    const cache = new ConversationCache({ ttlSeconds: 60, maxEntries: 2 });
    cache.set('a', { ...baseEntry, cacheName: 'a', createdAt: Date.now(), lastAccess: Date.now() });

    nowSpy.mockReturnValue(5);
    cache.set('b', { ...baseEntry, cacheName: 'b', createdAt: Date.now(), lastAccess: Date.now() });

    nowSpy.mockReturnValue(10);
    cache.get('a'); // a becomes most recent

    nowSpy.mockReturnValue(15);
    cache.set('c', { ...baseEntry, cacheName: 'c', createdAt: Date.now(), lastAccess: Date.now() });

    expect(cache.get('a')).not.toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});
