import { climberClientGame } from '@teckin/climber/client-game';
import { climberSettingsSchema } from '@teckin/climber';
import type { ClientGame } from '@teckin/game-contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registeredGames } from '../games/registry';
import {
  gameChoicesFor,
  questionSetFromSnapshot,
  readNewGameForm,
  type LaunchSnapshot,
} from './game-launch';

const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe('New game form choices', () => {
  it('lists every registered game with fields from its own schema', () => {
    const choices = gameChoicesFor(registeredGames);
    expect(choices.map((choice) => choice.id)).toEqual(
      registeredGames.map((game) => game.definition.id),
    );
    const climber = choices.find((choice) => choice.id === 'climber')!;
    expect(climber.displayName).toBe(climberClientGame.definition.displayName);
    expect(climber.fields.map((field) => field.name)).toEqual([
      'energyPerCorrectAnswer',
      'checkpointsEnabled',
    ]);
  });
});

describe('readNewGameForm', () => {
  const submitted = {
    gameId: 'climber',
    questionSetId: 'set-1',
    'game.energyPerCorrectAnswer': '150',
    'game.checkpointsEnabled': 'on',
    'room.durationMinutes': '20',
    'room.maxPlayers': '30',
  };

  it('reads the game, the set and both groups of settings', () => {
    expect(readNewGameForm(form(submitted), registeredGames)).toEqual({
      ok: true,
      gameId: 'climber',
      questionSetId: 'set-1',
      gameSettings: { energyPerCorrectAnswer: 150, checkpointsEnabled: true, summitGoal: 6 },
      roomSettings: { durationMinutes: 20, maxPlayers: 30, allowLateJoin: false },
    });
  });

  it('names every problem by its input', () => {
    const result = readNewGameForm(
      form({
        ...submitted,
        gameId: 'chess',
        questionSetId: '',
        'room.durationMinutes': '90',
      }),
      registeredGames,
    );
    expect(result).toEqual({
      ok: false,
      problems: {
        gameId: 'Choose a game.',
        questionSetId: 'Choose a question set.',
        'room.durationMinutes': 'Enter a whole number from 5 to 60.',
      },
    });
    const badGameSetting = readNewGameForm(
      form({ ...submitted, 'game.energyPerCorrectAnswer': '5' }),
      registeredGames,
    );
    expect(badGameSetting).toEqual({
      ok: false,
      problems: { 'game.energyPerCorrectAnswer': 'Enter a whole number from 20 to 500.' },
    });
  });

  it('accepts a setting added to the climber schema with no form code changes', () => {
    const extended: ClientGame = {
      ...climberClientGame,
      definition: {
        ...climberClientGame.definition,
        settingsSchema: climberSettingsSchema.extend({
          windStrength: z.number().int().min(0).max(5).default(2).meta({ title: 'Wind strength' }),
        }),
      },
    };
    const [choice] = gameChoicesFor([extended]);
    expect(choice!.fields.map((field) => field.label)).toContain('Wind strength');
    const result = readNewGameForm(form({ ...submitted, 'game.windStrength': '4' }), [extended]);
    expect(result.ok && result.gameSettings).toMatchObject({ windStrength: 4 });
  });
});

describe('questionSetFromSnapshot', () => {
  it('keeps the database ids so answers line up with the snapshot', () => {
    const snapshot: LaunchSnapshot = {
      questionSetId: '0199c3f2-6a51-7c11-9a43-000000000001',
      title: 'Capitals',
      questions: [
        {
          id: '0199c3f2-6a51-7c11-9a43-000000000002',
          type: 'trueFalse',
          prompt: 'Paris is the capital of France.',
          options: [
            { id: '0199c3f2-6a51-7c11-9a43-000000000003', text: 'True', isCorrect: true },
            { id: '0199c3f2-6a51-7c11-9a43-000000000004', text: 'False', isCorrect: false },
          ],
        },
      ],
    };
    const set = questionSetFromSnapshot(snapshot);
    expect(set.id).toBe(snapshot.questionSetId);
    expect(set.questions[0]!.options.map((option) => option.id)).toEqual([
      '0199c3f2-6a51-7c11-9a43-000000000003',
      '0199c3f2-6a51-7c11-9a43-000000000004',
    ]);
  });
});
