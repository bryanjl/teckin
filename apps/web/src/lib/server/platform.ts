import { consumeRateLimit, deleteAccount, rateLimitKey, unlimitedPlanLimits } from '@teckin/db';
import { getDatabaseClient, type PrismaClient } from '@teckin/db/client';

/*
 * Platform operations the web app needs beyond one organisation's data: sign-in rate limits,
 * account deletion and plan limits. Like `host.ts`, this file may use the raw database client;
 * each function says exactly what it acts on and takes it from the server, never from a form.
 */

const signInWindowMs = 15 * 60_000;

function limitFromEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Sign-in attempts allowed per 15 minutes: per network address (`SIGN_IN_LIMIT_PER_ADDRESS`,
 * default 30; a school shares one address, so this is generous) and per email address
 * (`SIGN_IN_LIMIT_PER_EMAIL`, default 5).
 */
export function signInRateLimits() {
  return {
    perAddress: {
      limit: limitFromEnvironment('SIGN_IN_LIMIT_PER_ADDRESS', 30),
      windowMs: signInWindowMs,
    },
    perEmail: {
      limit: limitFromEnvironment('SIGN_IN_LIMIT_PER_EMAIL', 5),
      windowMs: signInWindowMs,
    },
  };
}

/**
 * The caller's address for rate limiting. One proxy sits in front of the app when deployed
 * (App Service's front end) and appends the address it saw, so the last `X-Forwarded-For` entry
 * is trusted; earlier entries are whatever the caller sent.
 */
export function requestAddress(headers: Headers): string {
  const nearest = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return nearest || headers.get('x-real-ip') || 'unknown';
}

/** Whether one more sign-in attempt from this network address is allowed now. */
export async function allowSignInFromAddress(
  address: string,
  database: PrismaClient = getDatabaseClient(),
): Promise<boolean> {
  const decision = await consumeRateLimit(database, {
    key: rateLimitKey('sign-in-address', address),
    ...signInRateLimits().perAddress,
  });
  return decision.allowed;
}

/**
 * Whether one more sign-in email may go to this address now. `scope` keeps the sign-in form's
 * count apart from the email sender's, which also guards Auth.js' own sign-in endpoint.
 */
export async function allowSignInEmail(
  email: string,
  scope: 'form' | 'send',
  database: PrismaClient = getDatabaseClient(),
): Promise<boolean> {
  const decision = await consumeRateLimit(database, {
    key: rateLimitKey(`sign-in-email-${scope}`, email.trim().toLowerCase()),
    ...signInRateLimits().perEmail,
  });
  return decision.allowed;
}

/** Deletes the signed-in host's account and every organisation only they own. */
export async function deleteHostAccount(userId: string): Promise<void> {
  await deleteAccount(getDatabaseClient(), userId);
}

/**
 * The plan limits in force. Unlimited until billing exists; billing replaces this with limits
 * read from its plans.
 */
export const planLimits = unlimitedPlanLimits;
