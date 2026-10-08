import {
  launchGamePath,
  launchGamePurpose,
  type LaunchedGame,
  type LaunchGameRequest,
} from '@teckin/game-contracts';
import {
  issueHostPass,
  minimumSharedSecretLength,
  signRequest,
  type HostPassClaims,
} from '@teckin/room-core/realtime-trust';

/** Port the realtime server listens on in local development. */
const localRealtimeUrl = 'http://127.0.0.1:2567';

/** How the web server reaches the realtime server, or `null` when it is not configured. */
export interface RealtimeConnection {
  /** Base URL the web server calls (it may differ from the address phones use). */
  url: string;
  sharedSecret: string;
}

/**
 * Reads the realtime settings: `REALTIME_SHARED_SECRET` (the same value the realtime server
 * has) and `REALTIME_INTERNAL_URL`, falling back to `NEXT_PUBLIC_REALTIME_URL` and then the
 * local development address.
 */
export function realtimeConnection(
  environment: Record<string, string | undefined> = process.env,
): RealtimeConnection | null {
  const sharedSecret = environment.REALTIME_SHARED_SECRET?.trim() ?? '';
  if (sharedSecret.length < minimumSharedSecretLength) return null;
  const url =
    environment.REALTIME_INTERNAL_URL?.trim() ||
    environment.NEXT_PUBLIC_REALTIME_URL?.trim() ||
    localRealtimeUrl;
  return { url: url.replace(/\/+$/, ''), sharedSecret };
}

/** Why a launch did not reach a running room. */
export type LaunchProblem = 'notConfigured' | 'unreachable' | 'refused';

/** Asks the realtime server to create the game's room, with a request signed by the shared secret. */
export async function launchOnRealtime(
  request: LaunchGameRequest,
  connection: RealtimeConnection | null = realtimeConnection(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; game: LaunchedGame } | { ok: false; problem: LaunchProblem }> {
  if (!connection) return { ok: false, problem: 'notConfigured' };
  let response: Response;
  try {
    response = await fetchImpl(`${connection.url}${launchGamePath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signRequest(connection.sharedSecret, launchGamePurpose, request)),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, problem: 'unreachable' };
  }
  if (response.status !== 201) {
    console.error('The realtime server refused a launch', { status: response.status });
    return { ok: false, problem: 'refused' };
  }
  const game = (await response.json()) as Partial<LaunchedGame>;
  if (typeof game.roomId !== 'string') return { ok: false, problem: 'refused' };
  return { ok: true, game: { roomId: game.roomId, joinCode: game.joinCode ?? '' } };
}

/**
 * Signs a host pass. Callers must first check that the host's organisation owns the game; the
 * room then admits the pass only for its own room and organisation.
 */
export function signHostPass(
  claims: Omit<HostPassClaims, 'expiresAtMs'>,
  connection: RealtimeConnection | null = realtimeConnection(),
): string | null {
  return connection ? issueHostPass(connection.sharedSecret, claims) : null;
}
