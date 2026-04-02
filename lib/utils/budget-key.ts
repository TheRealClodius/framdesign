import { createHash } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import type { NextRequest } from 'next/server';

/** Matches client-generated IDs from `getUserId()` in storage.ts */
const CLIENT_USER_ID_RE = /^user-[a-z0-9]+-[a-z0-9]+$/;

/**
 * True when `userId` looks like our browser-persisted budget id (not arbitrary spoof strings).
 */
export function isValidClientUserId(userId: string | undefined | null): userId is string {
  if (!userId || typeof userId !== 'string') return false;
  if (userId.length > 128) return false;
  return CLIENT_USER_ID_RE.test(userId);
}

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/**
 * Client IP from Node/WS request headers (and optional direct socket address).
 */
export function getClientIpFromNodeHeaders(
  headers: IncomingHttpHeaders,
  socketRemoteAddress?: string
): string {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const v = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = v.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers['x-real-ip'];
  if (realIp) {
    const v = Array.isArray(realIp) ? realIp[0] : realIp;
    if (v) return v.trim();
  }
  if (socketRemoteAddress) return socketRemoteAddress;
  return 'unknown';
}

function clientIp(request: Request | NextRequest): string {
  return getClientIpFromHeaders(request.headers);
}

/**
 * Stable budget key: validated client id, else SHA-256 of client IP (privacy-preserving).
 */
export function resolveBudgetKeyFromParts(
  userId: string | undefined | null,
  clientIpAddr: string
): string {
  if (isValidClientUserId(userId)) {
    return userId;
  }
  const salt = process.env.USAGE_IP_HASH_SALT || '';
  return `ip:${createHash('sha256').update(salt + clientIpAddr).digest('hex').slice(0, 32)}`;
}

/**
 * Stable per-connection budget key for Next.js API routes.
 */
export function resolveBudgetKey(
  userId: string | undefined | null,
  request: Request | NextRequest
): string {
  return resolveBudgetKeyFromParts(userId, clientIp(request));
}
