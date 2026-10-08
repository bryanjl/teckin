import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { roomSettingsSchema } from './room-protocol';
import {
  labelFromKey,
  readSettingsForm,
  settingsFormFields,
  settingsProblems,
} from './settings-form';

const schema = z.object({
  rounds: z.number().int().min(1).max(10).default(3).meta({ title: 'Rounds', unit: 'rounds' }),
  speed: z.number().min(0.5).max(2).default(1),
  hints: z.boolean().default(false).meta({ description: 'Shows a hint button.' }),
  pace: z
    .enum(['calm', 'fast'])
    .default('calm')
    .meta({ choiceLabels: { fast: 'Very fast' } }),
  teamName: z.string().max(20).default(''),
  goal: z.number().int().min(1).max(6).default(6).meta({ assignmentsOnly: true }),
});

describe('settingsFormFields', () => {
  it('describes every setting from the schema, in order, with labels, ranges and defaults', () => {
    expect(settingsFormFields(schema)).toEqual([
      {
        name: 'rounds',
        label: 'Rounds',
        kind: 'number',
        integer: true,
        defaultValue: 3,
        min: 1,
        max: 10,
        unit: 'rounds',
      },
      {
        name: 'speed',
        label: 'Speed',
        kind: 'number',
        integer: false,
        defaultValue: 1,
        min: 0.5,
        max: 2,
      },
      {
        name: 'hints',
        label: 'Hints',
        help: 'Shows a hint button.',
        kind: 'boolean',
        defaultValue: false,
      },
      {
        name: 'pace',
        label: 'Pace',
        kind: 'choice',
        defaultValue: 'calm',
        choices: [
          { value: 'calm', label: 'Calm' },
          { value: 'fast', label: 'Very fast' },
        ],
      },
      { name: 'teamName', label: 'Team name', kind: 'text', defaultValue: '', maxLength: 20 },
    ]);
  });

  it('keeps assignment-only settings for the assignment form', () => {
    const names = settingsFormFields(schema, { mode: 'assignment' }).map((field) => field.name);
    expect(names).toContain('goal');
  });

  it('refuses settings it cannot draw', () => {
    expect(() => settingsFormFields(z.object({ count: z.number() }))).toThrow(/default/);
    expect(() => settingsFormFields(z.object({ list: z.array(z.string()).default([]) }))).toThrow(
      /cannot show/,
    );
    expect(() => settingsFormFields(z.string())).toThrow(/z.object/);
  });

  it('describes the platform room settings', () => {
    expect(settingsFormFields(roomSettingsSchema).map((field) => field.name)).toEqual([
      'durationMinutes',
      'maxPlayers',
      'allowLateJoin',
    ]);
  });
});

describe('reading a submitted settings form', () => {
  const fields = settingsFormFields(schema);

  it('turns submitted text into values the schema accepts', () => {
    const submitted: Record<string, string> = {
      rounds: '5',
      speed: '1.5',
      hints: 'on',
      pace: 'fast',
      teamName: 'Owls',
    };
    const values = readSettingsForm(fields, (name) => submitted[name] ?? null);
    expect(schema.parse(values)).toEqual({
      rounds: 5,
      speed: 1.5,
      hints: true,
      pace: 'fast',
      teamName: 'Owls',
      goal: 6,
    });
  });

  it('reads an unticked checkbox as off and reports out-of-range values in plain words', () => {
    const submitted: Record<string, string> = { rounds: '11', speed: 'fast', pace: 'calm' };
    const values = readSettingsForm(fields, (name) => submitted[name] ?? null);
    expect(values.hints).toBe(false);
    const result = schema.safeParse(values);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(settingsProblems(fields, result.error)).toEqual({
      rounds: 'Enter a whole number from 1 to 10.',
      speed: 'Enter a number from 0.5 to 2.',
    });
  });

  it('turns keys into words', () => {
    expect(labelFromKey('energyPerCorrectAnswer')).toBe('Energy per correct answer');
    expect(labelFromKey('max_players')).toBe('Max players');
  });
});
