/**
 * The part of a key-value store that join codes need. Colyseus `Presence` (local or Redis)
 * satisfies it, so codes are shared by every server process when Redis presence is on.
 */
export interface JoinCodeKeyValueStore {
  exists(key: string): Promise<boolean>;
  get(key: string): unknown;
  setex(key: string, value: string, seconds: number): unknown;
  expire(key: string, seconds: number): unknown;
  del(key: string): unknown;
}

/** Maps 6-digit join codes to the room that holds the game. */
export interface JoinCodeRegistry {
  /** Picks a free code for `roomId` and holds it for `ttlSeconds`. */
  claim(roomId: string, ttlSeconds: number): Promise<string>;
  /** Keeps a claimed code alive for another `ttlSeconds`. */
  refresh(code: string, ttlSeconds: number): Promise<void>;
  /** The room for a code, or `null` when no active game uses it. */
  lookup(code: string): Promise<string | null>;
  /** Frees a code when its game ends. */
  release(code: string): Promise<void>;
}

/** A join code is exactly 6 digits. */
export const joinCodePattern = /^\d{6}$/;

const keyPrefix = 'teckin:join-code:';

/** Generates a 6-digit code with no leading zero, so it never looks shorter when read aloud. */
export function randomJoinCode(random: () => number = Math.random): string {
  return String(100_000 + Math.floor(random() * 900_000));
}

/**
 * Creates a {@link JoinCodeRegistry} on a shared key-value store. A code is written only
 * after checking it is free, then read back, so two processes claiming the same code at the
 * same moment cannot both keep it.
 */
export function createJoinCodeRegistry(
  store: JoinCodeKeyValueStore,
  random: () => number = Math.random,
): JoinCodeRegistry {
  return {
    async claim(roomId, ttlSeconds) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const code = randomJoinCode(random);
        const key = keyPrefix + code;
        if (await store.exists(key)) {
          continue;
        }
        await store.setex(key, roomId, ttlSeconds);
        if ((await store.get(key)) === roomId) {
          return code;
        }
      }
      throw new Error('Could not find a free join code after 50 attempts.');
    },
    async refresh(code, ttlSeconds) {
      await store.expire(keyPrefix + code, ttlSeconds);
    },
    async lookup(code) {
      if (!joinCodePattern.test(code)) {
        return null;
      }
      const roomId = await store.get(keyPrefix + code);
      return typeof roomId === 'string' && roomId.length > 0 ? roomId : null;
    },
    async release(code) {
      await store.del(keyPrefix + code);
    },
  };
}
