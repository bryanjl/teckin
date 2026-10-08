'use client';

import { sampleQuestionSetIds, type SampleQuestionSetId } from '@teckin/questions';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { hostKeyStorageKey, safeStorage, writeStored } from '../../../lib/browser-storage';
import { realtimeUrl } from '../../../lib/join';

/** What `POST /dev/games` answers. */
interface CreatedGame {
  sessionId: string;
  joinCode: string;
  hostKey: string;
}

const fieldClass =
  'min-h-touch w-full rounded-xl border-2 border-ink-muted/40 bg-surface-raised px-3 text-lg text-ink';
const buttonClass =
  'min-h-touch rounded-2xl bg-accent px-6 text-lg font-bold text-accent-ink disabled:opacity-50';

/**
 * Creates a game with the dev secret, keeps its host key for this tab and opens the game's
 * host screen, which runs the lobby, the game and the results.
 */
export function NewGameForm() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [questionSetId, setQuestionSetId] = useState<SampleQuestionSetId>('maths');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [checkpointsEnabled, setCheckpointsEnabled] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setProblem(null);
    setBusy(true);
    const baseUrl = realtimeUrl(window.location);
    try {
      const response = await fetch(`${baseUrl}/dev/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gameId: 'climber',
          secret,
          questionSetId,
          settings: { durationMinutes },
          gameSettings: { checkpointsEnabled },
        }),
      });
      if (response.status === 403) {
        setProblem('That secret was not accepted (see DEV_GAME_SECRET in apps/realtime/.env).');
        setBusy(false);
        return;
      }
      if (!response.ok) {
        setProblem(`The realtime server refused the game (${response.status}).`);
        setBusy(false);
        return;
      }
      const game = (await response.json()) as CreatedGame;
      writeStored(safeStorage('session'), hostKeyStorageKey(game.sessionId), game.hostKey);
      // Without session storage the key travels in the fragment, which never reaches a server.
      const fragment = safeStorage('session') ? '' : `#hostKey=${encodeURIComponent(game.hostKey)}`;
      router.push(`/host/${encodeURIComponent(game.sessionId)}${fragment}`);
    } catch {
      setProblem(`Could not reach the realtime server at ${baseUrl}. Is it running?`);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void create(event)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span>Dev game secret</span>
        <input
          data-testid="dev-secret-input"
          type="password"
          autoComplete="current-password"
          className={fieldClass}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Question set</span>
        <select
          data-testid="dev-set-select"
          className={fieldClass}
          value={questionSetId}
          onChange={(event) => setQuestionSetId(event.target.value as SampleQuestionSetId)}
        >
          {sampleQuestionSetIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>Game length (minutes)</span>
        <input
          data-testid="dev-duration-input"
          type="number"
          min={5}
          max={60}
          className={fieldClass}
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(Number(event.target.value) || 15)}
        />
      </label>
      <label className="flex min-h-touch items-center gap-3">
        <input
          data-testid="dev-checkpoints-input"
          type="checkbox"
          className="size-6"
          checked={checkpointsEnabled}
          onChange={(event) => setCheckpointsEnabled(event.target.checked)}
        />
        <span>Checkpoints (recommended for younger classes)</span>
      </label>
      {problem ? (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      ) : null}
      <button type="submit" data-testid="dev-create-button" className={buttonClass} disabled={busy}>
        {busy ? 'Creating…' : 'Create game'}
      </button>
    </form>
  );
}
