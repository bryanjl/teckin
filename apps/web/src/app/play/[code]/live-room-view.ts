import type { GamePhaseName, RoomStateView } from '@teckin/game-contracts';

/** What the play page's own overlays (lobby, countdown) need from the room's state. */
export interface LiveRoomView {
  phase: GamePhaseName;
  /** Whole seconds left in the countdown, rounded up (3, 2, 1), or 0. */
  countdownSeconds: number;
  /** Nicknames of players in the room, this player first. */
  nicknames: string[];
  /** This player's nickname (the host may have renamed them). */
  ownNickname: string;
}

/**
 * Reduces the room's state to what the play page shows. Recomputed on every state update,
 * but React only re-renders when {@link sameLiveRoomView} says something changed.
 */
export function liveRoomViewOf(state: RoomStateView, ownPlayerId: string): LiveRoomView {
  const nicknames: string[] = [];
  let ownNickname = '';
  state.players.forEach((player, playerId) => {
    if (player.removed) return;
    if (playerId === ownPlayerId) ownNickname = player.nickname;
    else if (player.connected) nicknames.push(player.nickname);
  });
  nicknames.sort((a, b) => a.localeCompare(b));
  if (ownNickname) nicknames.unshift(ownNickname);
  return {
    phase: state.phase,
    countdownSeconds:
      state.phase === 'countdown' ? Math.max(1, Math.ceil(state.countdownRemainingMs / 1000)) : 0,
    nicknames,
    ownNickname,
  };
}

/** True when two views would render the same. */
export function sameLiveRoomView(a: LiveRoomView | undefined, b: LiveRoomView): boolean {
  return (
    a !== undefined &&
    a.phase === b.phase &&
    a.countdownSeconds === b.countdownSeconds &&
    a.ownNickname === b.ownNickname &&
    a.nicknames.length === b.nicknames.length &&
    a.nicknames.every((name, index) => name === b.nicknames[index])
  );
}
