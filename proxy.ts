import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const defaultLocale = 'en';
const OBS_COOKIE = 'obs_session';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect observability routes (pages + API, except login page and auth API)
  const isObsPage = pathname.startsWith('/observability') && pathname !== '/observability/login';
  const isObsApi = pathname.startsWith('/api/observability') && !pathname.startsWith('/api/observability/auth');
  if (isObsPage || isObsApi) {
    const token = request.cookies.get(OBS_COOKIE)?.value;
    const secret = process.env.OBSERVABILITY_JWT_SECRET;

    if (!token || !secret) {
      if (isObsApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return NextResponse.redirect(new URL('/observability/login', request.url));
    }

    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
    } catch {
      if (isObsApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return NextResponse.redirect(new URL('/observability/login', request.url));
    }

    return NextResponse.next();
  }

  // Skip rewriting for API routes, static files, Next.js internals, and observability
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/observability') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if pathname already has a locale segment
  const pathnameHasLocale = /^\/[a-z]{2}(\/|$)/.test(pathname);

  // If URL has /en prefix, redirect to clean URL (remove /en)
  if (pathname.startsWith(`/${defaultLocale}/`) || pathname === `/${defaultLocale}`) {
    const cleanPath = pathname === `/${defaultLocale}` 
      ? '/' 
      : pathname.replace(`/${defaultLocale}`, '');
    return NextResponse.redirect(new URL(cleanPath, request.url));
  }

  // If path has a different locale prefix, keep it (for future multi-locale support)
  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // Rewrite clean URLs internally to /en without changing the URL bar
  // This allows clean URLs like / to work while internally routing to /en
  const rewriteUrl = new URL(request.url);
  rewriteUrl.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`;
  
  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Note: /api/observability routes need proxy for auth check,
     * other /api routes are skipped early in the proxy function.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
