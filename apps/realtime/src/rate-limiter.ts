import type { Presence } from '@colyseus/core';

/** Settings for {@link createPresenceRateLimiter}. */
export interface PresenceRateLimiterOptions {
  /** Requests allowed per key per window. */
  limit: number;
  windowSeconds: number;
  /** Prefix that keeps this limiter's keys apart from other limiters'. */
  scope: string;
  now?: () => number;
}

/**
 * A fixed-window rate limiter counted in Colyseus presence: Redis when several processes run,
 * so every process shares one count per key, or memory for a single process. Returns a
 * function answering whether one more request for `key` is allowed now.
 */
export function createPresenceRateLimiter(
  presence: () => Presence,
  options: PresenceRateLimiterOptions,
): (key: string) => Promise<boolean> {
  const now = options.now ?? (() => Date.now());
  const windowMs = options.windowSeconds * 1000;
  return async (key) => {
    const window = Math.floor(now() / windowMs);
    const counterKey = `rate:${options.scope}:${key}:${window}`;
    const store = presence();
    const count = await store.incr(counterKey);
    // Twice the window, so a counter always outlives the window it counts.
    if (count === 1) await store.expire(counterKey, options.windowSeconds * 2);
    return count <= options.limit;
  };
}
