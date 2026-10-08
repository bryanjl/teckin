import type { GameDefinition } from '@teckin/game-contracts';
import type { BaseGameRoom } from './base-game-room';

/** A room class the realtime server can register: `BaseGameRoom` or a game's subclass of it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each game's room has its own state type
export type GameRoomClass = typeof BaseGameRoom<any>;

/**
 * A game as the realtime server registers it: the shared definition (id, settings schema,
 * ranking) plus the room class that runs it. A game's server entry exports one of these.
 */
export interface ServerGame<Settings = unknown, State = unknown> {
  definition: GameDefinition<Settings, State>;
  room: GameRoomClass;
}

/** Pairs a game definition with the room class that runs it. */
export function defineServerGame<Settings, State>(
  game: ServerGame<Settings, State>,
): ServerGame<Settings, State> {
  return game;
}
