import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const COOKIE_NAME = 'obs_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory rate limiting (resets on redeploy — fine for single-admin dashboard)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getJwtSecret(): Uint8Array {
  const secret = process.env.OBSERVABILITY_JWT_SECRET;
  if (!secret) throw new Error('Missing OBSERVABILITY_JWT_SECRET');
  return new TextEncoder().encode(secret);
}

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function checkRateLimit(ip: string): boolean {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordAttempt(ip: string): void {
  const entry = loginAttempts.get(ip);
  if (entry && Date.now() < entry.resetAt) {
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS });
  }
}

// POST — login
export async function POST(request: NextRequest) {
  const hash = process.env.OBSERVABILITY_PASSWORD_HASH;
  if (!hash) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  const ip = getClientIp(request);

  if (checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  try {
    const { passphrase } = await request.json();
    if (!passphrase || typeof passphrase !== 'string') {
      return NextResponse.json({ error: 'Passphrase required' }, { status: 400 });
    }

    const valid = await bcrypt.compare(passphrase, hash);
    if (!valid) {
      recordAttempt(ip);
      return NextResponse.json({ error: 'Invalid passphrase' }, { status: 401 });
    }

    // Clear rate limit on success
    loginAttempts.delete(ip);

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
