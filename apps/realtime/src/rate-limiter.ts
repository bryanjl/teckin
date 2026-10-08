/**
 * Creates a fixed-window rate limiter. Returns a function that answers whether one more
 * request from `key` is allowed now. In-process only: with several processes each counts on
 * its own, which still bounds code guessing to `limit × processes` per window.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): (key: string) => boolean {
  const now = options.now ?? (() => Date.now());
  const windows = new Map<string, { startedAtMs: number; count: number }>();
  return (key) => {
    const nowMs = now();
    if (windows.size > 10_000) {
      for (const [storedKey, window] of windows) {
        if (nowMs - window.startedAtMs >= options.windowMs) {
          windows.delete(storedKey);
        }
      }
    }
    const window = windows.get(key);
    if (!window || nowMs - window.startedAtMs >= options.windowMs) {
      windows.set(key, { startedAtMs: nowMs, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= options.limit;
  };
}
