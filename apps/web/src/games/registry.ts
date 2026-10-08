import { climberClientGame } from '@teckin/climber/client-game';
import type { ClientGame } from '@teckin/game-contracts';

/**
 * Every game the web app offers. "New game" lists these, the settings form is generated from
 * each one's schema, and the dashboard names games by their display name. Adding a game means
 * adding its `ClientGame` here, its host panel in `./host-panels`, and its `ServerGame` in the
 * realtime app's registry.
 */
export const registeredGames: readonly ClientGame[] = [climberClientGame];

/** The registered game for an id, or `undefined`. */
export function registeredGame(gameId: string): ClientGame | undefined {
  return registeredGames.find((game) => game.definition.id === gameId);
}

/** A game's display name, or the id itself for a game this app no longer offers. */
export function gameDisplayName(gameId: string): string {
  return registeredGame(gameId)?.definition.displayName ?? gameId;
}
