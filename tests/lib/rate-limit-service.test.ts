import { describe, test, expect } from '@jest/globals';
import { checkRateLimit } from '@/lib/services/rate-limit-service';

describe('rate-limit-service', () => {
  test('allows under max', () => {
    const r = checkRateLimit('t', 'id1', 60_000, 3);
    expect(r.ok).toBe(true);
    expect(checkRateLimit('t', 'id1', 60_000, 3).ok).toBe(true);
    expect(checkRateLimit('t', 'id1', 60_000, 3).ok).toBe(true);
  });

  test('blocks at max', () => {
    checkRateLimit('t2', 'id2', 60_000, 2);
    checkRateLimit('t2', 'id2', 60_000, 2);
    const r = checkRateLimit('t2', 'id2', 60_000, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBeGreaterThan(0);
  });
});
