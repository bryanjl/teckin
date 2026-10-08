import { climberServerGame } from '@teckin/climber/server';
import type { ServerGame } from '@teckin/room-core';

/**
 * Every game this server runs, one room type per game id. Adding a game means adding its
 * `ServerGame` here (and its definition to the web app's registry).
 */
export const serverGames: readonly ServerGame[] = [climberServerGame as ServerGame];

/** The registered game for an id, or `undefined`. */
export function serverGameFor(gameId: string): ServerGame | undefined {
  return serverGames.find((game) => game.definition.id === gameId);
}
