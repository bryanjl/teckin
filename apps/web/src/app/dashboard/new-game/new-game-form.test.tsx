import { climberClientGame } from '@teckin/climber/client-game';
import { climberSettingsSchema } from '@teckin/climber';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { gameChoicesFor, roomSettingsFields } from '../../../lib/game-launch';
import { NewGameForm } from './new-game-form';

// The form only hands this to useActionState; the server side is tested elsewhere.
vi.mock('./actions', () => ({ launchGame: vi.fn() }));

const sets = [{ id: 'set-1', title: 'Times tables', questionCount: 12 }];

function renderFormFor(settingsSchema: typeof climberClientGame.definition.settingsSchema) {
  const game = {
    ...climberClientGame,
    definition: { ...climberClientGame.definition, settingsSchema },
  };
  return renderToStaticMarkup(
    <NewGameForm games={gameChoicesFor([game])} roomFields={roomSettingsFields()} sets={sets} />,
  );
}

describe('NewGameForm', () => {
  it("draws the climber's settings, the room settings and the sets", () => {
    const html = renderFormFor(climberClientGame.definition.settingsSchema);
    expect(html).toContain('name="game.energyPerCorrectAnswer"');
    expect(html).toContain('name="game.checkpointsEnabled"');
    expect(html).not.toContain('summitGoal');
    expect(html).toContain('name="room.durationMinutes"');
    expect(html).toContain('Times tables');
    expect(html).toContain(climberClientGame.definition.displayName);
  });

  it('shows a field added to the climber settings schema with no form code changes', () => {
    const html = renderFormFor(
      climberSettingsSchema.extend({
        windStrength: z
          .number()
          .int()
          .min(0)
          .max(5)
          .default(2)
          .meta({ title: 'Wind strength', description: 'How hard the wind pushes.' }),
      }) as typeof climberClientGame.definition.settingsSchema,
    );
    expect(html).toContain('name="game.windStrength"');
    expect(html).toContain('Wind strength');
    expect(html).toContain('How hard the wind pushes.');
  });
});
