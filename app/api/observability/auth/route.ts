import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { getRedis } from '@/lib/services/redis-service';

const COOKIE_NAME = 'obs_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_TTL = 60 * 15; // 15 minutes

function getJwtSecret(): Uint8Array {
  const secret = process.env.OBSERVABILITY_JWT_SECRET;
  if (!secret) throw new Error('Missing OBSERVABILITY_JWT_SECRET');
  return new TextEncoder().encode(secret);
}

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// POST — login
export async function POST(request: NextRequest) {
  const hash = process.env.OBSERVABILITY_PASSWORD_HASH;
  if (!hash) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  const ip = getClientIp(request);
  const rateLimitKey = `obs:ratelimit:${ip}`;

  try {
    const redis = getRedis();
    const attempts = await redis.get<number>(rateLimitKey);
    if (attempts !== null && attempts >= MAX_LOGIN_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const { passphrase } = await request.json();
    if (!passphrase || typeof passphrase !== 'string') {
      return NextResponse.json({ error: 'Passphrase required' }, { status: 400 });
    }

    const valid = await bcrypt.compare(passphrase, hash);
    if (!valid) {
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, RATE_LIMIT_TTL);
      return NextResponse.json({ error: 'Invalid passphrase' }, { status: 401 });
    }

    // Clear rate limit on success
    await redis.del(rateLimitKey);

    const token = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(getJwtSecret());

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

// DELETE — logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return response;
}
