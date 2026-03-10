import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const COOKIE_NAME = 'obs_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getJwtSecret(): Uint8Array {
  const secret = process.env.OBSERVABILITY_JWT_SECRET;
  if (!secret) throw new Error('Missing OBSERVABILITY_JWT_SECRET');
  return new TextEncoder().encode(secret);
}

// POST — login
export async function POST(request: NextRequest) {
  const expected = process.env.OBSERVABILITY_PASSPHRASE;
  if (!expected) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  try {
    const { passphrase } = await request.json();
    if (!passphrase || typeof passphrase !== 'string') {
      return NextResponse.json({ error: 'Passphrase required' }, { status: 400 });
    }

    if (passphrase !== expected) {
      return NextResponse.json({ error: 'Invalid passphrase' }, { status: 401 });
    }

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
