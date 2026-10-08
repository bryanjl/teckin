'use client';

import type { SettingsField } from '@teckin/game-contracts';
import { SettingsFields, type SettingsFieldsClassNames } from '@teckin/ui';
import { useActionState, useState } from 'react';
import { gameSettingPrefix, roomSettingPrefix, type GameChoice } from '../../../lib/game-launch';
import { primaryButtonClass } from '../sets/editor-styles';
import { launchGame, type LaunchGameState } from './actions';

/** A set the host can launch a game with. */
export interface PlayableSet {
  id: string;
  title: string;
  questionCount: number;
}

/** Props for {@link NewGameForm}. */
export interface NewGameFormProps {
  games: readonly GameChoice[];
  roomFields: readonly SettingsField[];
  sets: readonly PlayableSet[];
  initialSetId?: string;
}

const initialState: LaunchGameState = { problems: {}, message: null, submitted: {} };

const settingClasses: SettingsFieldsClassNames = {
  field: 'flex flex-col gap-1',
  label: 'flex min-h-touch items-center gap-3 text-lg font-semibold',
  input:
    'min-h-touch w-full rounded-2xl border-2 border-ink-muted/40 bg-surface px-4 text-lg text-ink outline-none focus:border-accent aria-invalid:border-danger',
  checkbox: 'size-7 shrink-0 accent-accent',
  unit: 'flex items-center gap-3 text-lg text-ink-muted [&>input]:max-w-36',
  help: 'text-ink-muted',
  problem: 'font-semibold text-danger',
};

const choiceClass =
  'flex min-h-touch cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink-muted/30 bg-surface-raised px-4 py-3 has-checked:border-accent';

/** Values to show for a group of fields after a refused launch (none before the first try). */
function submittedValues(
  fields: readonly SettingsField[],
  prefix: string,
  submitted: Readonly<Record<string, string>>,
): Record<string, unknown> {
  if (Object.keys(submitted).length === 0) return {};
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = submitted[prefix + field.name];
    values[field.name] = field.kind === 'boolean' ? raw === 'on' : (raw ?? field.defaultValue);
  }
  return values;
}

/** Problems for one group of fields, keyed by setting name. */
function problemsFor(problems: Readonly<Record<string, string>>, prefix: string) {
  return Object.fromEntries(
    Object.entries(problems)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, message]) => [name.slice(prefix.length), message]),
  );
}

/**
 * The New game form. The game's settings are drawn by the shared `SettingsFields` from fields
 * generated on the server from the game's Zod schema; this form has no per-game code.
 */
export function NewGameForm({ games, roomFields, sets, initialSetId }: NewGameFormProps) {
  const [state, formAction, pending] = useActionState(launchGame, initialState);
  const [gameId, setGameId] = useState(state.submitted.gameId ?? games[0]?.id ?? '');
  const game = games.find((candidate) => candidate.id === gameId) ?? games[0];
  const chosenSetId =
    state.submitted.questionSetId ??
    (sets.some((set) => set.id === initialSetId) ? initialSetId : sets[0]?.id);

  return (
    <form action={formAction} className="flex flex-col gap-6" data-testid="new-game-form">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xl font-bold">Game</legend>
        {games.map((choice) => (
          <label key={choice.id} className={choiceClass}>
            <input
              type="radio"
              name="gameId"
              value={choice.id}
              checked={choice.id === game?.id}
              onChange={() => setGameId(choice.id)}
              className="size-6 accent-accent"
              data-testid={`game-choice-${choice.id}`}
            />
            <span className="text-lg font-semibold">{choice.displayName}</span>
          </label>
        ))}
        {state.problems.gameId ? (
          <p role="alert" className="font-semibold text-danger">
            {state.problems.gameId}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xl font-bold">Questions</legend>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto" data-testid="set-choices">
          {sets.map((set) => (
            <label key={set.id} className={choiceClass}>
              <input
                type="radio"
                name="questionSetId"
                value={set.id}
                defaultChecked={set.id === chosenSetId}
                className="size-6 shrink-0 accent-accent"
                data-testid="set-choice"
              />
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold">{set.title}</span>
                <span className="text-ink-muted">{set.questionCount} questions</span>
              </span>
            </label>
          ))}
        </div>
        {state.problems.questionSetId ? (
          <p role="alert" className="font-semibold text-danger">
            {state.problems.questionSetId}
          </p>
        ) : null}
      </fieldset>

      {game && game.fields.length > 0 ? (
        <fieldset className="flex flex-col gap-4" data-testid="game-settings">
          <legend className="mb-2 text-xl font-bold">{game.displayName} settings</legend>
          <SettingsFields
            key={game.id}
            fields={game.fields}
            namePrefix={gameSettingPrefix}
            values={submittedValues(game.fields, gameSettingPrefix, state.submitted)}
            problems={problemsFor(state.problems, gameSettingPrefix)}
            classNames={settingClasses}
            testIdPrefix="game-setting"
          />
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-4" data-testid="room-settings">
        <legend className="mb-2 text-xl font-bold">Length and players</legend>
        <SettingsFields
          fields={roomFields}
          namePrefix={roomSettingPrefix}
          values={submittedValues(roomFields, roomSettingPrefix, state.submitted)}
          problems={problemsFor(state.problems, roomSettingPrefix)}
          classNames={settingClasses}
          testIdPrefix="room-setting"
        />
      </fieldset>

      {state.message ? (
        <p role="alert" className="text-lg font-semibold text-danger" data-testid="launch-problem">
          {state.message}
        </p>
      ) : null}
      <div className="sticky bottom-0 -mx-4 bg-surface/95 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="submit"
          className={`${primaryButtonClass} min-h-touch-large w-full text-2xl`}
          disabled={pending}
          data-testid="launch-button"
        >
          {pending ? 'Starting…' : 'Launch game'}
        </button>
      </div>
    </form>
  );
}
