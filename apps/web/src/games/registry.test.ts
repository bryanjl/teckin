import { describe, expect, it } from 'vitest';
import { hostPanels } from './host-panels';
import { gameDisplayName, registeredGame, registeredGames } from './registry';

describe('game registry', () => {
  it('registers the Climber, with unique ids', () => {
    const ids = registeredGames.map((game) => game.definition.id);
    expect(ids).toContain('climber');
    expect(new Set(ids).size).toBe(ids.length);
    expect(registeredGame('climber')?.definition.supportsAssignments).toBe(false);
  });

  it('gives every registered game a host panel', () => {
    for (const game of registeredGames) {
      expect(hostPanels[game.definition.id], game.definition.id).toBeDefined();
    }
  });

  it('names games by their display name, falling back to the id', () => {
    expect(gameDisplayName('climber')).toBe(registeredGame('climber')!.definition.displayName);
    expect(gameDisplayName('retired-game')).toBe('retired-game');
  });
});
