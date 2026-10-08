import { z } from 'zod';

/**
 * The wire protocol every game room shares (lobby, host controls, lifecycle). Server and
 * clients both validate with these schemas; game-specific messages live with each game.
 */

/** Where a game is in its life. Every game shares these phases. */
export const gamePhases = ['lobby', 'countdown', 'playing', 'ended'] as const;

/** One of {@link gamePhases}. */
export type GamePhaseName = (typeof gamePhases)[number];

/**
 * A read-only map as clients see it in synchronised room state (a Colyseus `MapSchema` has
 * this shape), so browser code can read state without importing the server's schema types.
 */
export interface StateMapView<Value> {
  get(key: string): Value | undefined;
  forEach(callback: (value: Value, key: string) => void): void;
  readonly size: number;
}

/** One roster entry in synchronised room state. */
export interface RosterPlayerView {
  readonly id: string;
  readonly nickname: string;
  readonly connected: boolean;
  readonly removed: boolean;
}

/** The synchronised state every room shares, as clients read it. Games add their own fields. */
export interface RoomStateView {
  readonly gameId: string;
  readonly joinCode: string;
  readonly phase: GamePhaseName;
  readonly locked: boolean;
  readonly allowLateJoin: boolean;
  readonly maxPlayers: number;
  /** Milliseconds left in the countdown while counting down, else 0. */
  readonly countdownRemainingMs: number;
  /** Milliseconds of play left once playing; the full duration before that. */
  readonly remainingMs: number;
  readonly endReason: string;
  readonly players: StateMapView<RosterPlayerView>;
}

/** Options a player sends when joining a room. */
export const playerJoinOptionsSchema = z.object({
  role: z.literal('player'),
  nickname: z.string().min(1).max(40),
  /**
   * Random key the player's browser keeps for this site. It is the reconnect token (a player
   * who comes back with it resumes as themselves) and lets a host's kick stick. Never personal.
   */
  deviceKey: z.string().min(16).max(128),
});

/** Options a host screen sends when joining a room. */
export const hostJoinOptionsSchema = z.object({
  role: z.literal('host'),
  hostKey: z.string().min(16).max(128),
});

/** Join options for any room. */
export const roomJoinOptionsSchema = z.discriminatedUnion('role', [
  playerJoinOptionsSchema,
  hostJoinOptionsSchema,
]);

export type PlayerJoinOptions = z.infer<typeof playerJoinOptionsSchema>;
export type HostJoinOptions = z.infer<typeof hostJoinOptionsSchema>;
export type RoomJoinOptions = z.infer<typeof roomJoinOptionsSchema>;

/** Room settings every game shares, set by the host when the game is created. */
export const roomSettingsSchema = z.object({
  /** Most players allowed in the room. */
  maxPlayers: z.number().int().min(1).max(200).default(60),
  /** Whether players may join after the game has started. */
  allowLateJoin: z.boolean().default(true),
  /** Game length in minutes. */
  durationMinutes: z.number().int().min(5).max(60).default(15),
});

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

/** Message types the host screen sends. */
export const hostMessageTypes = {
  start: 'host:start',
  end: 'host:end',
  lock: 'host:lock',
  kick: 'host:kick',
  rename: 'host:rename',
  addTime: 'host:addTime',
  allowKicked: 'host:allowKicked',
} as const;

/** Payload schemas for each host message. */
export const hostMessageSchemas = {
  [hostMessageTypes.start]: z.object({}).strict(),
  [hostMessageTypes.end]: z.object({}).strict(),
  [hostMessageTypes.lock]: z.object({ locked: z.boolean() }).strict(),
  [hostMessageTypes.kick]: z.object({ playerId: z.string().min(1).max(64) }).strict(),
  [hostMessageTypes.rename]: z
    .object({ playerId: z.string().min(1).max(64), nickname: z.string().min(1).max(40) })
    .strict(),
  [hostMessageTypes.addTime]: z.object({ minutes: z.number().int().min(1).max(30) }).strict(),
  [hostMessageTypes.allowKicked]: z.object({}).strict(),
} as const;

/** Message types the server sends to clients. */
export const serverMessageTypes = {
  /** Sent to a player just before the host's kick disconnects them. */
  kicked: 'room:kicked',
  /** Sent to a host when one of their commands could not be applied. */
  hostCommandRejected: 'room:hostCommandRejected',
} as const;

/** Requests a client sends and the server answers (Colyseus `room.request`). */
export const clientRequestTypes = {
  /** Asks who this connection is in the room; answered with a {@link WelcomeMessage}. */
  whoAmI: 'room:whoAmI',
} as const;

/** Answer to {@link clientRequestTypes.whoAmI}. */
export interface WelcomeMessage {
  playerId: string;
  nickname: string;
  resumed: boolean;
}

/** Payload of {@link serverMessageTypes.hostCommandRejected}. */
export interface HostCommandRejectedMessage {
  type: string;
  reason: string;
}

/**
 * Close codes and join-error codes the platform uses. Values sit in the 4000 range that
 * WebSocket reserves for applications.
 */
export const roomCloseCodes = {
  kicked: 4001,
  gameDisposed: 4002,
  /** The same device joined again on a newer connection (another tab or a reload). */
  replaced: 4003,
} as const;

/** Why a join was refused; sent as the join error's message so clients can explain it. */
export type JoinRefusal =
  | 'invalidOptions'
  | 'wrongHostKey'
  | 'gameEnded'
  | 'lateJoinClosed'
  | 'locked'
  | 'roomFull'
  | 'kicked'
  | 'nicknameTaken'
  | 'nicknameInvalid';

/** Join error code used for every {@link JoinRefusal}. */
export const joinRefusedErrorCode = 4403;
