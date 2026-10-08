'use server';

import { currentHost } from '../../../lib/server/host';
import { signHostPass } from '../../../lib/server/realtime';

/** What the host screen gets to join a game's room. */
export type HostPassResult =
  | { ok: true; roomId: string; hostPass: string }
  | { ok: false; reason: 'signedOut' | 'notFound' | 'notConfigured' };

/**
 * A fresh host pass for a game, issued only when the signed-in host's organisation owns it.
 * The host screen asks for one each time it joins, so a pass never needs to live long.
 */
export async function requestHostPass(gameSessionId: unknown): Promise<HostPassResult> {
  const host = await currentHost();
  if (!host) return { ok: false, reason: 'signedOut' };
  if (typeof gameSessionId !== 'string' || gameSessionId.length > 64) {
    return { ok: false, reason: 'notFound' };
  }
  const game = await host.data.gameSessions.get(gameSessionId);
  if (!game?.roomId) return { ok: false, reason: 'notFound' };
  const hostPass = signHostPass({
    roomId: game.roomId,
    organisationId: host.membership.organisationId,
    userId: host.userId,
  });
  if (!hostPass) return { ok: false, reason: 'notConfigured' };
  return { ok: true, roomId: game.roomId, hostPass };
}
