/** The browser storage areas this app uses, or `null` where the browser blocks them. */
export function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

const deviceKeyName = 'teckin.deviceKey';
let fallbackDeviceKey: string | undefined;

/**
 * This browser's random device key: the player's reconnect token, never personal data. It is
 * kept in `localStorage` so a player who reloads, or whose phone discards the tab, comes back
 * as the same player; without storage it lasts as long as the page.
 */
export function deviceKey(
  storage: Storage | null = safeStorage('local'),
  randomBytes: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) =>
    crypto.getRandomValues(bytes),
): string {
  try {
    const stored = storage?.getItem(deviceKeyName);
    if (stored && /^[A-Za-z0-9_-]{16,128}$/.test(stored)) return stored;
  } catch {
    // Storage can throw even after access succeeded (quota, private modes).
  }
  fallbackDeviceKey ??= toBase64Url(randomBytes(new Uint8Array(24)));
  try {
    storage?.setItem(deviceKeyName, fallbackDeviceKey);
  } catch {
    // Keep the in-memory key.
  }
  return fallbackDeviceKey;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Key under which the nickname used for a game is remembered for this tab. */
export function nicknameStorageKey(code: string): string {
  return `teckin.nickname.${code}`;
}

/** Reads a value, treating blocked storage as empty. */
export function readStored(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Writes a value, ignoring blocked storage. */
export function writeStored(storage: Storage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Nothing to do: the value only saves typing.
  }
}

/** Where a created game's host key is kept for this tab, for the host screen to pick up. */
export function hostKeyStorageKey(sessionId: string): string {
  return `teckin.hostKey.${sessionId}`;
}
