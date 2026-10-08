import { hostMessageTypes, type GamePhaseName, type RoomStateView } from '@teckin/game-contracts';

/** One player in the host's player list. */
export interface HostPlayer {
  id: string;
  nickname: string;
  connected: boolean;
}

/** What the platform part of the host screen shows, reduced from the room's state. */
export interface HostView {
  phase: GamePhaseName;
  joinCode: string;
  locked: boolean;
  allowLateJoin: boolean;
  maxPlayers: number;
  /** Whole seconds left in the countdown (3, 2, 1), or 0. */
  countdownSeconds: number;
  /** Whole seconds of play left (the full length before the start). */
  remainingSeconds: number;
  endReason: string;
  /** Players still in the game (removed ones left out), by nickname. */
  players: HostPlayer[];
  /** Players the host has removed. */
  removedCount: number;
}

/** Reduces the room's shared state to the host screen's platform view. */
export function hostViewOf(state: RoomStateView): HostView {
  const players: HostPlayer[] = [];
  let removedCount = 0;
  state.players.forEach((player, id) => {
    if (player.removed) removedCount += 1;
    else players.push({ id, nickname: player.nickname, connected: player.connected });
  });
  players.sort((a, b) => a.nickname.localeCompare(b.nickname));
  return {
    phase: state.phase,
    joinCode: state.joinCode,
    locked: state.locked,
    allowLateJoin: state.allowLateJoin,
    maxPlayers: state.maxPlayers,
    countdownSeconds:
      state.phase === 'countdown' ? Math.max(1, Math.ceil(state.countdownRemainingMs / 1000)) : 0,
    remainingSeconds: Math.max(0, Math.ceil(state.remainingMs / 1000)),
    endReason: state.endReason,
    players,
    removedCount,
  };
}

/** True when two views render the same, so React can skip the update. */
export function sameHostView(a: HostView | undefined, b: HostView): boolean {
  if (a === undefined) return false;
  const { players: playersA, ...restA } = a;
  const { players: playersB, ...restB } = b;
  if (playersA.length !== playersB.length) return false;
  const keys = Object.keys(restA) as (keyof typeof restA)[];
  return (
    keys.every((key) => restA[key] === restB[key]) &&
    playersA.every(
      (player, index) =>
        player.id === playersB[index]!.id &&
        player.nickname === playersB[index]!.nickname &&
        player.connected === playersB[index]!.connected,
    )
  );
}

/** A join code split for reading aloud and from the back of a room: "482 913". */
export function formatJoinCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** The link players open (or scan) to join a game. */
export function joinLinkFor(origin: string, code: string): string {
  return `${origin}/join?code=${encodeURIComponent(code)}`;
}

/** The join link without its scheme, shorter to read off a projector. */
export function displayJoinLink(link: string): string {
  return link.replace(/^https?:\/\//, '');
}

/** Words for why a game ended, for the host's results. */
export function describeEndReason(reason: string): string {
  switch (reason) {
    case 'goalReached':
      return 'Someone reached the top.';
    case 'timeUp':
      return 'Time ran out.';
    case 'hostEnded':
      return 'You ended the game.';
    case 'abandoned':
      return 'Everyone left.';
    default:
      return '';
  }
}

/** Words for a host command the room refused, by the room's reason code. */
export function describeHostRejection(reason: string): string {
  switch (reason) {
    case 'nicknameTaken':
      return 'Another player already has that name.';
    case 'nicknameInvalid':
      return 'That name is not allowed. Try a different one.';
    case 'unknownPlayer':
      return 'That player has already left.';
    case 'notInLobby':
      return 'The game has already started.';
    case 'notPlaying':
      return 'Time can only be added while the game is running.';
    case 'alreadyEnded':
      return 'The game has already ended.';
    default:
      return 'The game could not do that. Try again.';
  }
}

/** Anything that can send room messages (a Colyseus SDK room). */
export interface MessageSender {
  send(type: string, message: unknown): void;
}

/** The host's commands, as typed calls that send the shared host messages. */
export interface HostCommands {
  start(): void;
  end(): void;
  setLocked(locked: boolean): void;
  kick(playerId: string): void;
  rename(playerId: string, nickname: string): void;
  addTime(minutes: number): void;
  allowKicked(): void;
}

/** Host commands sent through `room`. */
export function hostCommandsFor(room: MessageSender): HostCommands {
  return {
    start: () => room.send(hostMessageTypes.start, {}),
    end: () => room.send(hostMessageTypes.end, {}),
    setLocked: (locked) => room.send(hostMessageTypes.lock, { locked }),
    kick: (playerId) => room.send(hostMessageTypes.kick, { playerId }),
    rename: (playerId, nickname) => room.send(hostMessageTypes.rename, { playerId, nickname }),
    addTime: (minutes) => room.send(hostMessageTypes.addTime, { minutes }),
    allowKicked: () => room.send(hostMessageTypes.allowKicked, {}),
  };
}
