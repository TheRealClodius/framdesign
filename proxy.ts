import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const defaultLocale = 'en';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip proxy for API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
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
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
