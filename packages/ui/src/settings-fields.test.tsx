import { settingsFormFields } from '@teckin/game-contracts';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SettingsFields } from './settings-fields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const schema = z.object({
  rounds: z.number().int().min(1).max(10).default(3).meta({ title: 'Rounds', unit: 'rounds' }),
  hints: z.boolean().default(true).meta({ description: 'Shows a hint button.' }),
  pace: z.enum(['calm', 'fast']).default('fast'),
  teamName: z.string().max(20).default('Owls'),
});

describe('SettingsFields', () => {
  it('draws one labelled input per setting with its default and range', () => {
    act(() =>
      root.render(
        <form>
          <SettingsFields fields={settingsFormFields(schema)} namePrefix="game." />
        </form>,
      ),
    );
    const form = container.querySelector('form')!;
    const rounds = form.querySelector<HTMLInputElement>('[name="game.rounds"]')!;
    expect(rounds.type).toBe('number');
    expect([rounds.value, rounds.min, rounds.max]).toEqual(['3', '1', '10']);
    expect(rounds.labels?.[0]?.textContent).toBe('Rounds');
    const hints = form.querySelector<HTMLInputElement>('[name="game.hints"]')!;
    expect(hints.checked).toBe(true);
    expect(hints.labels?.[0]?.textContent).toBe('Hints');
    expect(container.textContent).toContain('Shows a hint button.');
    expect(form.querySelector<HTMLSelectElement>('[name="game.pace"]')!.value).toBe('fast');
    expect(form.querySelector<HTMLInputElement>('[name="game.teamName"]')!.value).toBe('Owls');
    expect(container.textContent).toContain('rounds');
  });

  it('shows submitted values and problems, tied to their inputs', () => {
    act(() =>
      root.render(
        <SettingsFields
          fields={settingsFormFields(schema)}
          values={{ rounds: 12 }}
          problems={{ rounds: 'Enter a whole number from 1 to 10.' }}
        />,
      ),
    );
    const rounds = container.querySelector<HTMLInputElement>('[name="rounds"]')!;
    expect(rounds.value).toBe('12');
    expect(rounds.getAttribute('aria-invalid')).toBe('true');
    const problem = container.querySelector('[role="alert"]')!;
    expect(problem.textContent).toBe('Enter a whole number from 1 to 10.');
    expect(rounds.getAttribute('aria-describedby')).toContain(problem.id);
  });
});
