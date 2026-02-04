export type ConversationCacheEntry = {
  cacheName: string | null;
  cachedMessageCount: number;
  summary: string | null;
  summaryUpToIndex: number;
  createdAt: number;
  lastAccess: number;
};

export type ConversationCacheConfig = {
  ttlSeconds: number;
  maxEntries: number;
};

export class ConversationCache {
  private store: Map<string, ConversationCacheEntry>;
  private ttlMs: number;
  private maxEntries: number;

  constructor(config: ConversationCacheConfig) {
    this.store = new Map();
    this.ttlMs = config.ttlSeconds * 1000;
    this.maxEntries = config.maxEntries;
  }

  get(key: string): ConversationCacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }

    const updated = { ...entry, lastAccess: Date.now() };
    this.store.set(key, updated);
    return updated;
  }

  set(key: string, entry: ConversationCacheEntry): void {
    this.store.set(key, { ...entry, lastAccess: Date.now() });
    this.cleanup();
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.createdAt > this.ttlMs) {
        this.store.delete(key);
      }
    }

    if (this.store.size <= this.maxEntries) return;

    const entries = Array.from(this.store.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
      .slice(0, this.store.size - this.maxEntries);

    for (const [key] of entries) {
      this.store.delete(key);
    }
  }

  size(): number {
    return this.store.size;
  }
}
