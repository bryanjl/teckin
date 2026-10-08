import { hostKeyStorageKey, readStored, writeStored } from './browser-storage';

const keyPattern = /^[A-Za-z0-9_-]{16,128}$/;

/** The host key carried in a link's fragment (`#hostKey=…`), if it holds a well-formed one. */
export function hostKeyFromFragment(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('hostKey');
  return value && keyPattern.test(value) ? value : null;
}

/**
 * The host key for a game's host screen. A key in the link's fragment wins and is kept in
 * this tab's `sessionStorage` (fragments never reach any server, so a link opened on a
 * second screen carries it without it appearing in logs); otherwise the key the game's
 * creator stored for this tab is used. `null` when there is neither.
 */
export function resolveHostKey(
  sessionId: string,
  hash: string,
  storage: Storage | null,
): { hostKey: string | null; fromFragment: boolean } {
  const fromLink = hostKeyFromFragment(hash);
  if (fromLink) {
    writeStored(storage, hostKeyStorageKey(sessionId), fromLink);
    return { hostKey: fromLink, fromFragment: true };
  }
  const stored = readStored(storage, hostKeyStorageKey(sessionId));
  return { hostKey: stored && keyPattern.test(stored) ? stored : null, fromFragment: false };
}

/** A link to a game's host screen that carries the host key, for opening it on another screen. */
export function hostScreenLink(origin: string, sessionId: string, hostKey: string): string {
  return `${origin}/host/${encodeURIComponent(sessionId)}#hostKey=${encodeURIComponent(hostKey)}`;
}
