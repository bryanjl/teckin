import { NextResponse, type NextRequest } from 'next/server';
import { playerPageContentSecurityPolicy } from './lib/server/content-security-policy';

/**
 * Gives the player pages (`/join`, `/play/*`) a strict, nonce-based Content Security Policy.
 * Next.js reads the nonce from the request's policy header and puts it on its own scripts,
 * which is why those pages render per request.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const policy = playerPageContentSecurityPolicy({
    nonce,
    requestHost: request.headers.get('host') ?? request.nextUrl.host,
    secure: (forwardedProtocol ?? request.nextUrl.protocol.replace(':', '')) === 'https',
    configuredRealtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL,
    configuredConnectSources: process.env.REALTIME_CONNECT_SOURCES,
    development: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/join',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    {
      source: '/play/:path*',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
