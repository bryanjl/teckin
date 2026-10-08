import type { NextRequest } from 'next/server';
import { handlers } from '../../../../auth';
import { allowSignInFromAddress, requestAddress } from '../../../../lib/server/platform';

export const { GET } = handlers;

/**
 * Auth.js' POST endpoints, with sign-in starts (`/api/auth/signin/...`) rate-limited per network
 * address like the sign-in form, so calling the endpoint directly gains nothing.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (
    request.nextUrl.pathname.startsWith('/api/auth/signin') &&
    !(await allowSignInFromAddress(requestAddress(request.headers)))
  ) {
    return new Response('Too many sign-in attempts. Try again later.', {
      status: 429,
      headers: { 'retry-after': '900' },
    });
  }
  return handlers.POST(request);
}
