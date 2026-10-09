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
 * The caller's address for rate limiting. Each trusted proxy in front of the app appends the
 * address it saw to `X-Forwarded-For`, so the entry `TRUSTED_PROXY_COUNT` places from the end
 * is the caller as the outermost trusted proxy saw it; earlier entries are whatever the caller
 * sent. Locally and behind one proxy that is the last entry (count 1, the default). Deployed
 * behind Azure Front Door and App Service's front end it is the second to last (count 2,
 * which the web Bicep sets); with count 1 there, everyone near one Front Door edge would share
 * a single limit.
 */
export function requestAddress(
  headers: Headers,
  trustedProxyCount: number = limitFromEnvironment('TRUSTED_PROXY_COUNT', 1),
): string {
  const entries = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const caller = entries.length > 0 ? entries[Math.max(0, entries.length - trustedProxyCount)] : '';
  return caller || headers.get('x-real-ip') || 'unknown';
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
