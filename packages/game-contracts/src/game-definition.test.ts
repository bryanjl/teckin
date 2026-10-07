import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineGame } from './game-definition';

describe('defineGame', () => {
  it('returns the definition unchanged and keeps the settings schema usable', () => {
    const settingsSchema = z.object({ rounds: z.number().int().min(1) });
    const definition = defineGame({
      id: 'example',
      displayName: 'Example',
      settingsSchema,
      defaultSettings: { rounds: 3 },
      supportsAssignments: false,
      createServerRoom: () => null,
      loadClientGame: async () => ({ mount: async () => () => undefined }),
      rankPlayers: () => [],
      summarisePlayer: () => ({}),
    });

    expect(definition.id).toBe('example');
    expect(definition.settingsSchema.parse(definition.defaultSettings)).toEqual({ rounds: 3 });
    expect(definition.settingsSchema.safeParse({ rounds: 0 }).success).toBe(false);
  });
});
