'use client';

import { describeNicknameProblem, reviewNickname } from '@teckin/nicknames';
import { useState, type FormEvent } from 'react';
import type { HostCommands, HostPlayer } from './host-view';

const smallButton =
  'min-h-11 rounded-xl px-3 text-base font-semibold focus-visible:outline-3 focus-visible:outline-amber-300';

/** One player with Rename and Remove, each confirmed in place. */
function PlayerRow({
  player,
  colour,
  commands,
}: {
  player: HostPlayer;
  colour: string | undefined;
  commands: HostCommands;
}) {
  const [mode, setMode] = useState<'idle' | 'renaming' | 'confirmRemove'>('idle');
  const [draft, setDraft] = useState(player.nickname);
  const [problem, setProblem] = useState<string | null>(null);

  const submitRename = (event: FormEvent): void => {
    event.preventDefault();
    const review = reviewNickname(draft);
    if (!review.ok) {
      setProblem(describeNicknameProblem(review.problem));
      return;
    }
    if (review.nickname !== player.nickname) commands.rename(player.id, review.nickname);
    setProblem(null);
    setMode('idle');
  };

  return (
    <li
      data-testid="host-player"
      data-player-id={player.id}
      data-connected={player.connected ? 'true' : 'false'}
      className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-800 px-3 py-2"
    >
      {mode === 'renaming' ? (
        <form onSubmit={submitRename} className="flex w-full flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`rename-${player.id}`}>
            New name for {player.nickname}
          </label>
          <input
            id={`rename-${player.id}`}
            data-testid="rename-input"
            autoFocus
            maxLength={40}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-slate-500 bg-slate-900 px-3 text-lg text-white"
          />
          <button
            type="submit"
            data-testid="rename-save"
            className={`${smallButton} bg-amber-500 text-stone-900`}
          >
            Save
          </button>
          <button
            type="button"
            className={`${smallButton} bg-slate-700 text-white`}
            onClick={() => {
              setMode('idle');
              setProblem(null);
              setDraft(player.nickname);
            }}
          >
            Cancel
          </button>
          {problem ? (
            <p role="alert" className="w-full text-sm text-red-300">
              {problem}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full"
            style={{ background: colour ?? '#94a3b8' }}
          />
          <span
            data-testid="host-player-name"
            className="min-w-0 flex-1 truncate text-xl font-bold"
          >
            {player.nickname}
          </span>
          {player.connected ? null : (
            <span className="rounded-full bg-slate-700 px-2 text-sm text-slate-300">away</span>
          )}
          {mode === 'confirmRemove' ? (
            <>
              <button
                type="button"
                data-testid="remove-confirm"
                className={`${smallButton} bg-red-600 text-white`}
                onClick={() => {
                  commands.kick(player.id);
                  setMode('idle');
                }}
              >
                Remove {player.nickname}
              </button>
              <button
                type="button"
                className={`${smallButton} bg-slate-700 text-white`}
                onClick={() => setMode('idle')}
              >
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-testid="rename-button"
                aria-label={`Rename ${player.nickname}`}
                className={`${smallButton} bg-slate-700 text-white`}
                onClick={() => {
                  setDraft(player.nickname);
                  setMode('renaming');
                }}
              >
                Rename
              </button>
              <button
                type="button"
                data-testid="remove-button"
                aria-label={`Remove ${player.nickname}`}
                className={`${smallButton} bg-slate-700 text-red-300`}
                onClick={() => setMode('confirmRemove')}
              >
                Remove
              </button>
            </>
          )}
        </>
      )}
    </li>
  );
}

/** The host's player list: who is here, with rename and remove for each. */
export function PlayerList({
  players,
  commands,
  colourOf,
}: {
  players: HostPlayer[];
  commands: HostCommands;
  colourOf?: (playerId: string) => string | undefined;
}) {
  if (players.length === 0) {
    return (
      <p data-testid="host-no-players" className="text-xl text-slate-400">
        Waiting for players to join…
      </p>
    );
  }
  return (
    <ul data-testid="host-players" className="grid gap-2 2xl:grid-cols-2">
      {players.map((player) => (
        <PlayerRow
          key={player.id}
          player={player}
          colour={colourOf?.(player.id)}
          commands={commands}
        />
      ))}
    </ul>
  );
}
