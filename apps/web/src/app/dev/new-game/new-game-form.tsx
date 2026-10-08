'use client';

import { Client, type Room } from '@colyseus/sdk';
import { formatTimeLeft } from '@teckin/engine-core';
import { hostMessageTypes, type HostJoinOptions, type RoomStateView } from '@teckin/game-contracts';
import { sampleQuestionSetIds, type SampleQuestionSetId } from '@teckin/questions';
import { useEffect, useState, type FormEvent } from 'react';
import { hostKeyStorageKey, safeStorage, writeStored } from '../../../lib/browser-storage';
import { realtimeUrl } from '../../../lib/join';

/** What `POST /dev/games` answers. */
interface CreatedGame {
  sessionId: string;
  joinCode: string;
  hostKey: string;
}

/** The parts of the room's state this page shows. */
interface HostView {
  phase: string;
  remainingMs: number;
  countdownMs: number;
  nicknames: string[];
}

const fieldClass =
  'min-h-touch w-full rounded-xl border-2 border-ink-muted/40 bg-surface-raised px-3 text-lg text-ink';
const buttonClass =
  'min-h-touch rounded-2xl bg-accent px-6 text-lg font-bold text-accent-ink disabled:opacity-50';

/** Creates a game, then joins it as the host to show the lobby and start or end it. */
export function NewGameForm() {
  const [secret, setSecret] = useState('');
  const [questionSetId, setQuestionSetId] = useState<SampleQuestionSetId>('maths');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedGame | undefined>();
  const [host, setHost] = useState<Room | undefined>();
  const [view, setView] = useState<HostView | undefined>();

  useEffect(() => {
    if (!host) return;
    const onState = (state: unknown): void => {
      const room = state as RoomStateView;
      const nicknames: string[] = [];
      room.players.forEach((player) => {
        if (!player.removed)
          nicknames.push(player.connected ? player.nickname : `${player.nickname} (away)`);
      });
      setView({
        phase: room.phase,
        remainingMs: room.remainingMs,
        countdownMs: room.countdownRemainingMs,
        nicknames: nicknames.sort((a, b) => a.localeCompare(b)),
      });
    };
    host.onStateChange(onState);
    return () => {
      host.onStateChange.remove(onState);
      void host.leave(true);
    };
  }, [host]);

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
        }),
      });
      if (response.status === 403) {
        setProblem('That secret was not accepted (see DEV_GAME_SECRET in apps/realtime/.env).');
        return;
      }
      if (!response.ok) {
        setProblem(`The realtime server refused the game (${response.status}).`);
        return;
      }
      const game = (await response.json()) as CreatedGame;
      writeStored(safeStorage('session'), hostKeyStorageKey(game.sessionId), game.hostKey);
      const options: HostJoinOptions = { role: 'host', hostKey: game.hostKey };
      const room = await new Client(baseUrl).joinById(game.sessionId, options);
      setCreated(game);
      setHost(room);
    } catch {
      setProblem(`Could not reach the realtime server at ${baseUrl}. Is it running?`);
    } finally {
      setBusy(false);
    }
  };

  if (!created) {
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
            type="number"
            min={5}
            max={60}
            className={fieldClass}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value) || 15)}
          />
        </label>
        {problem ? (
          <p role="alert" className="text-danger">
            {problem}
          </p>
        ) : null}
        <button
          type="submit"
          data-testid="dev-create-button"
          className={buttonClass}
          disabled={busy}
        >
          {busy ? 'Creating…' : 'Create game'}
        </button>
      </form>
    );
  }

  const joinUrl = `${window.location.origin}/join?code=${created.joinCode}`;
  const send = (type: string): void => host?.send(type, {});
  return (
    <section className="flex flex-col gap-4" data-testid="dev-game">
      <p className="text-ink-muted">Game code</p>
      <p data-testid="dev-join-code" className="text-6xl font-black tracking-widest text-accent">
        {created.joinCode}
      </p>
      <p className="break-all">
        Players open{' '}
        <a className="underline" href={joinUrl}>
          {joinUrl}
        </a>
      </p>
      <p data-testid="dev-phase">
        Phase: <strong>{view?.phase ?? '…'}</strong>
        {view?.phase === 'playing' ? ` · ${formatTimeLeft(view.remainingMs)} left` : ''}
        {view?.phase === 'countdown' ? ` · ${Math.ceil(view.countdownMs / 1000)}` : ''}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="dev-start-button"
          className={buttonClass}
          disabled={view?.phase !== 'lobby' || view.nicknames.length === 0}
          onClick={() => send(hostMessageTypes.start)}
        >
          Start game
        </button>
        <button
          type="button"
          data-testid="dev-end-button"
          className={buttonClass}
          disabled={view?.phase === 'ended'}
          onClick={() => send(hostMessageTypes.end)}
        >
          End game
        </button>
      </div>
      <h2 className="text-xl font-bold">Players ({view?.nicknames.length ?? 0})</h2>
      <ul data-testid="dev-players" className="flex flex-wrap gap-2">
        {view?.nicknames.map((name) => (
          <li key={name} className="rounded-full bg-surface-raised px-3 py-1">
            {name}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">Session id: {created.sessionId}</p>
    </section>
  );
}
