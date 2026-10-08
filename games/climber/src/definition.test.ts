import { settingsFormFields } from '@teckin/game-contracts';
import { describe, expect, it } from 'vitest';
import { climberGame } from './definition';
import { defaultClimberSettings } from './settings';

describe('climberGame', () => {
  it('offers its host settings to the generated form, leaving out assignment-only ones', () => {
    const fields = settingsFormFields(climberGame.settingsSchema);
    expect(fields.map((field) => [field.name, field.label, field.defaultValue])).toEqual([
      ['energyPerCorrectAnswer', 'Energy per correct answer', 100],
      ['checkpointsEnabled', 'Checkpoints', false],
    ]);
    expect(climberGame.settingsSchema.parse({})).toEqual(defaultClimberSettings);
  });
});
