import type { ClientGame } from '@teckin/game-contracts';
import { climberGame } from './definition';

/** The Climber as the web app registers it; the Phaser client loads only when a game is played. */
export const climberClientGame: ClientGame = {
  definition: climberGame as ClientGame['definition'],
  loadClientGame: async () => (await import('./client/index')).default,
};
