import { schema, t, type SchemaType } from '@colyseus/schema';

/** One player as every client sees them in the shared roster. */
export const RosterPlayer = schema(
  {
    id: t.string(),
    nickname: t.string(),
    connected: t.boolean().default(true),
    /** True once the host removed the player; kept so late patches never resurrect them. */
    removed: t.boolean().default(false),
  },
  'RosterPlayer',
);
export type RosterPlayer = SchemaType<typeof RosterPlayer>;

/**
 * The synchronised state every game room shares: lifecycle, join code, lock, timer and roster.
 * Games extend it with `RoomStateBase.extend({...})` to add their own fields.
 */
export const RoomStateBase = schema(
  {
    gameId: t.string(),
    joinCode: t.string(),
    phase: t.string<'lobby' | 'countdown' | 'playing' | 'ended'>().default('lobby'),
    locked: t.boolean().default(false),
    allowLateJoin: t.boolean().default(true),
    maxPlayers: t.uint16().default(60),
    /** Milliseconds left in the countdown while counting down, else 0. */
    countdownRemainingMs: t.uint32().default(0),
    /** Milliseconds of play left once playing; the full duration before that. */
    remainingMs: t.uint32().default(0),
    /** Why the game ended, once it has. */
    endReason: t.string().default(''),
    players: t.map(RosterPlayer),
  },
  'RoomStateBase',
);
export type RoomStateBase = SchemaType<typeof RoomStateBase>;
