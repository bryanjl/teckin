/** Minimal shape of the Screen Wake Lock API, which not every browser or DOM lib has. */
interface WakeLockSentinelLike {
  release(): Promise<void>;
  readonly released?: boolean;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen awake while a game is mounted, where the browser supports it. Browsers
 * drop the lock when the tab is hidden, so it is requested again when the tab returns.
 * Failure is silent: a sleeping screen is an annoyance, not an error.
 * Returns a function that releases the lock and stops re-acquiring it.
 */
export function holdScreenWakeLock(document: Document): () => void {
  const wakeLock = (document.defaultView?.navigator as { wakeLock?: WakeLockLike } | undefined)
    ?.wakeLock;
  if (!wakeLock) return () => {};

  let sentinel: WakeLockSentinelLike | undefined;
  let active = true;

  const acquire = async (): Promise<void> => {
    if (!active || document.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    try {
      sentinel = await wakeLock.request('screen');
      if (!active) await sentinel.release();
    } catch {
      sentinel = undefined;
    }
  };
  const onVisibilityChange = (): void => {
    void acquire();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  void acquire();

  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    void sentinel?.release().catch(() => {});
    sentinel = undefined;
  };
}
