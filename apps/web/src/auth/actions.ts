'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '../auth';
import { allowSignInEmail, allowSignInFromAddress, requestAddress } from '../lib/server/platform';
import { readAuthEnvironment } from './auth-environment';
import { emailProviderId } from './magic-link';
import { safeReturnPath } from './return-path';

const longestEmail = 254;
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** OAuth providers a sign-in button may name. */
const oauthProviderIds = { google: 'google', microsoft: 'microsoft-entra-id' } as const;

function backToSignIn(error: string, returnPath: string): never {
  redirect(`/sign-in?error=${error}&callbackUrl=${encodeURIComponent(returnPath)}`);
}

/**
 * Sends a magic link to the address in the form, then shows "check your email". Rate-limited
 * per network address and per email address (see `signInRateLimits`).
 */
export async function signInWithEmail(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(formData.get('callbackUrl'));
  const email = String(formData.get('email') ?? '').trim();
  if (email.length > longestEmail || !emailShape.test(email)) {
    backToSignIn('InvalidEmail', returnPath);
  }
  if (!readAuthEnvironment().magicLinks) backToSignIn('EmailUnavailable', returnPath);
  const address = requestAddress(await headers());
  if (!(await allowSignInFromAddress(address)) || !(await allowSignInEmail(email, 'form'))) {
    backToSignIn('TooManyAttempts', returnPath);
  }
  // Auth.js would redirect through /api/auth/verify-request, which leaves that address in the
  // browser; going straight to our page keeps the address bar honest.
  await signIn(emailProviderId, { email, redirectTo: returnPath, redirect: false });
  redirect('/sign-in/check-email');
}

/** Starts Google or Microsoft sign-in, if this deployment has it configured. */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const returnPath = safeReturnPath(formData.get('callbackUrl'));
  const requested = formData.get('provider');
  const environment = readAuthEnvironment();
  if (requested === 'google' && environment.google) {
    await signIn(oauthProviderIds.google, { redirectTo: returnPath });
  } else if (requested === 'microsoft' && environment.microsoft) {
    await signIn(oauthProviderIds.microsoft, { redirectTo: returnPath });
  }
  backToSignIn('ProviderUnavailable', returnPath);
}

/** Signs the host out and returns to the home page. */
export async function signOutHost(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
