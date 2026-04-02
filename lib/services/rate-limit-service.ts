/**
 * In-memory sliding-window rate limits per server instance.
 * For strict global limits across all instances, add Redis/KV; this still caps per-instance abuse.
 */

type WindowEntry = { count: number; windowStart: number };

const windows = new Map<string, WindowEntry>();

function prune(key: string, windowMs: number, now: number): WindowEntry {
  const e = windows.get(key);
  if (!e || now - e.windowStart >= windowMs) {
    const fresh = { count: 0, windowStart: now };
    windows.set(key, fresh);
    return fresh;
  }
  return e;
}

export function checkRateLimit(
  bucket: string,
  id: string,
  windowMs: number,
  maxInWindow: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  if (maxInWindow <= 0 || windowMs <= 0) return { ok: true };

  const now = Date.now();
  const key = `${bucket}:${id}`;
  const entry = prune(key, windowMs, now);

  if (entry.count >= maxInWindow) {
    const elapsed = now - entry.windowStart;
    const retryAfterMs = Math.max(0, windowMs - elapsed);
    return { ok: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) || 1 };
  }

  entry.count += 1;
  windows.set(key, entry);
  return { ok: true };
}
