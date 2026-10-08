import { describe, expect, it } from 'vitest';
import { climberSettingsSchema, defaultClimberSettings } from './settings';
import { defaultClimberTunables } from './tunables';

describe('climber settings', () => {
  it('defaults to the spec values', () => {
    expect(defaultClimberSettings).toEqual({
      energyPerCorrectAnswer: 100,
      checkpointsEnabled: false,
      summitGoal: 6,
    });
  });

  it('rejects values outside the spec ranges', () => {
    expect(climberSettingsSchema.safeParse({ energyPerCorrectAnswer: 10 }).success).toBe(false);
    expect(climberSettingsSchema.safeParse({ summitGoal: 7 }).success).toBe(false);
  });

  it('keeps the tunables chosen by the Phase 2 playtests (docs/playtests.md)', () => {
    expect(defaultClimberTunables).toMatchObject({
      startingEnergy: 50,
      jumpCost: 24,
      doubleJumpCost: 30,
      walkingCostPerTile: 2,
    });
  });
});
