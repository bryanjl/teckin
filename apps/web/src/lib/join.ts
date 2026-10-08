import type { JoinRefusal } from '@teckin/game-contracts';
import { joinRefusedErrorCode } from '@teckin/game-contracts';

/** Port the realtime server listens on in local development (see `apps/realtime`). */
const localRealtimePort = 2567;

/**
 * Base HTTP URL of the realtime server. `NEXT_PUBLIC_REALTIME_URL` wins when the deployment
 * sets it; otherwise the realtime server is assumed on the same host as the page, port 2567,
 * so a phone opening the laptop's address on the local network reaches it too.
 */
export function realtimeUrl(location: Pick<Location, 'protocol' | 'hostname'>): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return `${location.protocol}//${location.hostname}:${localRealtimePort}`;
}

/** A 6-digit join code, as typed: spaces and dashes are ignored. */
export function normaliseJoinCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/** True for a well-formed join code (6 digits, never starting with 0). */
export function isJoinCode(code: string): boolean {
  return /^[1-9]\d{5}$/.test(code);
}

/** Why a code could not be resolved. */
export type JoinCodeProblem = 'unknownCode' | 'tooManyRequests' | 'unreachable';

/** Resolves a join code to the room id, or says why it could not. */
export async function lookupJoinCode(
  baseUrl: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; roomId: string } | { ok: false; problem: JoinCodeProblem }> {
  if (!isJoinCode(code)) return { ok: false, problem: 'unknownCode' };
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/join-codes/${code}`);
  } catch {
    return { ok: false, problem: 'unreachable' };
  }
  if (response.status === 429) return { ok: false, problem: 'tooManyRequests' };
  if (!response.ok) return { ok: false, problem: 'unknownCode' };
  const body = (await response.json()) as { roomId?: unknown };
  return typeof body.roomId === 'string'
    ? { ok: true, roomId: body.roomId }
    : { ok: false, problem: 'unknownCode' };
}

/** Everything that can stop a player joining, in words a child can act on. */
export type JoinProblem = JoinCodeProblem | JoinRefusal | 'failed';

/** Player-facing explanation of a {@link JoinProblem}. */
export function describeJoinProblem(problem: JoinProblem): string {
  switch (problem) {
    case 'unknownCode':
      return 'We could not find a game with that code. Check it and try again.';
    case 'tooManyRequests':
      return 'Too many tries. Wait a minute, then try again.';
    case 'unreachable':
      return 'Could not reach the game. Check your connection and try again.';
    case 'gameEnded':
      return 'That game has finished.';
    case 'lateJoinClosed':
      return 'That game has already started and is not taking new players.';
    case 'locked':
      return 'The host has locked this game.';
    case 'roomFull':
      return 'That game is full.';
    case 'kicked':
      return 'The host removed you from this game.';
    case 'nicknameTaken':
      return 'Someone in this game already has that name. Try another.';
    case 'nicknameInvalid':
      return 'Please choose a different nickname.';
    case 'invalidOptions':
    case 'wrongHostKey':
    case 'failed':
      return 'Something went wrong joining the game. Try again.';
  }
}

const joinRefusals: readonly JoinRefusal[] = [
  'invalidOptions',
  'wrongHostKey',
  'gameEnded',
  'lateJoinClosed',
  'locked',
  'roomFull',
  'kicked',
  'nicknameTaken',
  'nicknameInvalid',
];

/** Turns an error thrown by `joinById` into a {@link JoinProblem}. */
export function joinProblemFromError(error: unknown): JoinProblem {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code === joinRefusedErrorCode && typeof message === 'string') {
    const refusal = joinRefusals.find((reason) => message.includes(reason));
    if (refusal) return refusal;
  }
  if (typeof message === 'string' && /fetch|network|connect/i.test(message)) return 'unreachable';
  return 'failed';
}
