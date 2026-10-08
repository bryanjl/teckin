'use client';

import { Client, type Room } from '@colyseus/sdk';
import { formatTimeLeft } from '@teckin/engine-core';
import {
  roomCloseCodes,
  serverMessageTypes,
  type HostCommandRejectedMessage,
  type HostJoinOptions,
  type RoomStateView,
  type ShellAppearance,
} from '@teckin/game-contracts';
import { Leaderboard } from '@teckin/ui';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { safeStorage } from '../../../lib/browser-storage';
import { hostScreenLink, resolveHostKey } from '../../../lib/host-key';
import { joinProblemFromError, realtimeUrl } from '../../../lib/join';
import { hostPanelFor, type HostGamePanel } from './host-game-panels';
import {
  describeEndReason,
  describeHostRejection,
  hostCommandsFor,
  hostViewOf,
  joinLinkFor,
  sameHostView,
  type HostCommands,
  type HostView,
} from './host-view';
import { JoinPanel } from './join-panel';
import { PlayerList } from './player-list';

/** Why the host screen cannot show the game. */
interface HostProblem {
  message: string;
  canRetry: boolean;
}

/** The platform's colours (see `@teckin/config/tailwind/theme.css`) for the shared leaderboard. */
const hostAppearance: ShellAppearance = {
  accent: '#f59e0b',
  panel: '#1e293b',
  text: '#f8fafc',
  textMuted: '#cbd5e1',
  correct: '#22c55e',
  wrong: '#ef4444',
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const bigButton =
  'min-h-touch rounded-2xl px-6 text-xl font-bold disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-4 focus-visible:outline-amber-300';
const quietButton =
  'min-h-12 rounded-xl bg-slate-700 px-4 text-lg font-semibold text-white hover:bg-slate-600 disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-amber-300';

function phaseLabel(view: HostView): string {
  switch (view.phase) {
    case 'lobby':
      return 'Lobby';
    case 'countdown':
      return 'Starting';
    case 'playing':
      return 'Playing';
    case 'ended':
      return 'Finished';
  }
}

/** Header controls that apply in the lobby and during play: lock and letting removed players back. */
function RoomControls({ view, commands }: { view: HostView; commands: HostCommands }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="lock-button"
        aria-pressed={view.locked}
        className={quietButton}
        onClick={() => commands.setLocked(!view.locked)}
      >
        {view.locked ? 'Unlock joining' : 'Lock joining'}
      </button>
      {view.removedCount > 0 ? (
        <button
          type="button"
          data-testid="allow-removed-button"
          className={quietButton}
          onClick={() => commands.allowKicked()}
        >
          Let removed players back
        </button>
      ) : null}
    </div>
  );
}

/** End game, with a second press to confirm so a stray click never ends a class's game. */
function EndGameButton({ onEnd }: { onEnd: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(timer);
  }, [confirming]);
  return confirming ? (
    <button
      type="button"
      data-testid="end-confirm-button"
      className={`${bigButton} bg-red-600 text-white`}
      onClick={() => {
        setConfirming(false);
        onEnd();
      }}
    >
      Yes, end now
    </button>
  ) : (
    <button
      type="button"
      data-testid="end-button"
      className={`${bigButton} bg-slate-700 text-white`}
      onClick={() => setConfirming(true)}
    >
      End game
    </button>
  );
}

/** The live host screen of one game: everything a teacher projects and controls. */
export function HostScreen({ sessionId }: { sessionId: string }) {
  const [room, setRoom] = useState<Room | undefined>();
  const [view, setView] = useState<HostView | undefined>();
  const [, setStateVersion] = useState(0);
  const [problem, setProblem] = useState<HostProblem | undefined>();
  const [reconnecting, setReconnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [origin, setOrigin] = useState('');
  const [hostKey, setHostKey] = useState<string | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let joined: Room | undefined;
    let frame = 0;
    const cleanups: (() => void)[] = [];

    const join = async (): Promise<void> => {
      setOrigin(window.location.origin);
      setProblem(undefined);
      const resolved = resolveHostKey(sessionId, window.location.hash, safeStorage('session'));
      if (resolved.fromFragment) {
        // Keep the key out of the address bar (and screenshots of it) once it is stored.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      if (!resolved.hostKey) {
        setProblem({
          message:
            'This screen needs the host link for this game. Open it from the page that created the game.',
          canRetry: false,
        });
        return;
      }
      const key = resolved.hostKey;
      setHostKey(key);
      const options: HostJoinOptions = { role: 'host', hostKey: key };
      try {
        joined = await new Client(realtimeUrl(window.location)).joinById(sessionId, options);
      } catch (error) {
        if (cancelled) return;
        const reason = joinProblemFromError(error);
        setProblem(
          reason === 'wrongHostKey'
            ? { message: 'This host link does not match the game.', canRetry: false }
            : reason === 'unreachable'
              ? {
                  message: 'Could not reach the game server. Check it is running, then try again.',
                  canRetry: true,
                }
              : {
                  message: 'Could not find this game. It may have finished and closed.',
                  canRetry: true,
                },
        );
        return;
      }
      if (cancelled) {
        void joined.leave(true);
        return;
      }
      const live = joined;
      let shown: HostView | undefined;
      const onState = (state: unknown): void => {
        if (!state) return;
        const next = hostViewOf(state as RoomStateView);
        if (next.phase === 'ended') endedRef.current = true;
        if (!sameHostView(shown, next)) {
          shown = next;
          setView(next);
        }
        // The game's live view and the leaderboard read the room state directly; redraw at
        // most once a frame however many patches arrive.
        if (frame === 0) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            setStateVersion((version) => version + 1);
          });
        }
      };
      live.onStateChange(onState);
      const onRejected = (message: HostCommandRejectedMessage): void =>
        setNotice(describeHostRejection(message.reason));
      const stopRejected = live.onMessage(serverMessageTypes.hostCommandRejected, onRejected);
      const onDrop = (): void => setReconnecting(true);
      const onReconnect = (): void => setReconnecting(false);
      const onLeave = (closeCode: number): void => {
        setReconnecting(false);
        if (cancelled) return;
        if (closeCode === roomCloseCodes.gameDisposed) {
          if (!endedRef.current) setProblem({ message: 'This game has closed.', canRetry: false });
          return;
        }
        if (closeCode !== 1000) {
          setProblem({ message: 'Lost the connection to the game.', canRetry: true });
        }
      };
      live.onDrop(onDrop);
      live.onReconnect(onReconnect);
      live.onLeave(onLeave);
      cleanups.push(() => {
        live.onStateChange.remove(onState);
        stopRejected();
        live.onDrop.remove(onDrop);
        live.onReconnect.remove(onReconnect);
        live.onLeave.remove(onLeave);
      });
      setRoom(live);
      onState(live.state);
    };
    void join();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      for (const cleanup of cleanups) cleanup();
      void joined?.leave(true);
      setRoom(undefined);
    };
  }, [sessionId, attempt]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const commands = useMemo(() => (room ? hostCommandsFor(room) : undefined), [room]);

  if (problem) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-8">
        <h1 className="text-3xl font-bold">Host screen</h1>
        <p role="alert" data-testid="host-problem" className="text-2xl">
          {problem.message}
        </p>
        <div className="flex flex-wrap gap-3">
          {problem.canRetry ? (
            <button
              type="button"
              className={`${bigButton} bg-amber-500 text-stone-900`}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          ) : null}
          <Link
            href="/dev/new-game"
            className={`${bigButton} flex items-center bg-slate-700 text-white`}
          >
            New game
          </Link>
        </div>
      </main>
    );
  }

  const state = room?.state as RoomStateView | undefined;
  if (!room || !view || !commands || !state) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p data-testid="host-connecting" className="text-2xl text-slate-300">
          Connecting to the game…
        </p>
      </main>
    );
  }

  const panel: HostGamePanel | undefined = hostPanelFor(state.gameId);
  const joinLink = joinLinkFor(origin, view.joinCode);
  const onLocalhost =
    origin !== '' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(origin).hostname);
  const standings = panel?.standings(state) ?? [];
  const winnerId = panel?.winnerId(state) ?? '';
  const winner = standings.find((row) => row.playerId === winnerId);
  const timeLow = view.phase === 'playing' && view.remainingSeconds <= 60;

  return (
    <main
      data-testid="host-screen"
      data-phase={view.phase}
      className="flex min-h-dvh flex-col gap-4 px-4 py-4 lg:h-dvh lg:px-8"
    >
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h1 className="text-2xl font-black text-amber-400">{panel?.title ?? state.gameId}</h1>
        <span
          data-testid="host-phase"
          className="rounded-full bg-slate-800 px-3 py-1 text-lg font-semibold"
        >
          {phaseLabel(view)}
        </span>
        {view.locked ? (
          <span data-testid="locked-badge" className="rounded-full bg-red-900 px-3 py-1 text-lg">
            Joining locked
          </span>
        ) : null}
        <span className="text-lg text-slate-300" data-testid="host-player-count">
          {view.players.length} {view.players.length === 1 ? 'player' : 'players'}
        </span>
        {reconnecting ? (
          <span role="status" className="rounded-full bg-amber-900 px-3 py-1 text-lg">
            Reconnecting…
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {view.phase === 'playing' || view.phase === 'countdown' ? (
            <span
              data-testid="host-timer"
              aria-label="Time left"
              className={`font-mono text-5xl font-black tabular-nums ${timeLow ? 'text-red-400' : 'text-white'}`}
            >
              {formatTimeLeft(view.remainingSeconds * 1000)}
            </span>
          ) : null}
          {view.phase === 'playing' ? (
            <>
              <button
                type="button"
                data-testid="add-minute-button"
                className={quietButton}
                onClick={() => commands.addTime(1)}
              >
                +1 min
              </button>
              <button
                type="button"
                data-testid="add-five-minutes-button"
                className={quietButton}
                onClick={() => commands.addTime(5)}
              >
                +5 min
              </button>
            </>
          ) : null}
          {view.phase === 'playing' || view.phase === 'countdown' ? (
            <EndGameButton onEnd={() => commands.end()} />
          ) : null}
        </div>
      </header>

      {notice ? (
        <p
          role="status"
          data-testid="host-notice"
          className="rounded-2xl bg-amber-900/60 px-4 py-2 text-lg"
        >
          {notice}
        </p>
      ) : null}

      {view.phase === 'lobby' || view.phase === 'countdown' ? (
        <div className="grid flex-1 gap-8 lg:min-h-0 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
          <section aria-label="How to join" className="flex flex-col justify-center gap-4">
            <JoinPanel code={view.joinCode} link={joinLink} />
            {onLocalhost ? (
              <p className="text-base text-amber-200">
                Phones cannot open “localhost”. Open this page at your computer’s network address
                (for example http://192.168.1.20:3000) so the link and QR code work.
              </p>
            ) : null}
          </section>
          <section aria-label="Players" className="flex flex-col gap-4 lg:min-h-0">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="start-button"
                className={`${bigButton} bg-amber-500 text-stone-900`}
                disabled={view.phase !== 'lobby' || view.players.length === 0}
                onClick={() => commands.start()}
              >
                Start game
              </button>
              <RoomControls view={view} commands={commands} />
            </div>
            <p className="text-lg text-slate-400">
              {[
                `${Math.round(view.remainingSeconds / 60)} min`,
                view.allowLateJoin ? 'Late joining on' : 'Late joining off',
                ...(panel?.settingsSummary(state) ?? []),
              ].join(' · ')}
            </p>
            <div className="lg:min-h-0 lg:overflow-y-auto">
              <PlayerList
                players={view.players}
                commands={commands}
                {...(panel?.markerColourOf ? { colourOf: panel.markerColourOf } : {})}
              />
            </div>
          </section>
        </div>
      ) : null}

      {view.phase === 'countdown' ? (
        <div
          data-testid="host-countdown"
          aria-live="assertive"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85"
        >
          <span className="text-[min(50vh,40vw)] leading-none font-black text-amber-400">
            {view.countdownSeconds}
          </span>
        </div>
      ) : null}

      {view.phase === 'playing' && panel ? (
        <div className="grid flex-1 gap-6 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <section aria-label="Live view" className="h-[70vh] lg:h-auto lg:min-h-0">
            <panel.LiveView state={state} />
          </section>
          <aside className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
            {view.allowLateJoin && !view.locked ? (
              <JoinPanel code={view.joinCode} link={joinLink} compact />
            ) : null}
            <Leaderboard
              rows={standings}
              appearance={hostAppearance}
              title="Leaderboard"
              maxRows={10}
              large
              {...(panel.markerColourOf ? { markerColourOf: panel.markerColourOf } : {})}
            />
            <details className="rounded-2xl bg-slate-900 p-3">
              <summary className="min-h-11 cursor-pointer text-lg font-semibold">
                Manage players
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <RoomControls view={view} commands={commands} />
                <PlayerList
                  players={view.players}
                  commands={commands}
                  {...(panel.markerColourOf ? { colourOf: panel.markerColourOf } : {})}
                />
              </div>
            </details>
          </aside>
        </div>
      ) : null}

      {view.phase === 'ended' ? (
        <section
          data-testid="host-results"
          aria-label="Results"
          className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 lg:min-h-0"
        >
          <div className="rounded-3xl bg-slate-800 p-6 text-center">
            <p className="text-xl text-slate-300">{describeEndReason(view.endReason)}</p>
            {winner ? (
              <p data-testid="host-winner" className="text-5xl font-black text-amber-400">
                {winner.nickname} wins!
              </p>
            ) : (
              <p className="text-4xl font-black">Game over</p>
            )}
          </div>
          <div className="lg:min-h-0 lg:overflow-y-auto">
            <Leaderboard
              rows={standings}
              appearance={hostAppearance}
              title="Final ranking"
              large
              {...(panel?.markerColourOf ? { markerColourOf: panel.markerColourOf } : {})}
            />
          </div>
          <Link
            href="/dev/new-game"
            className={`${bigButton} flex items-center justify-center self-center bg-amber-500 text-stone-900`}
          >
            New game
          </Link>
        </section>
      ) : null}

      {hostKey && view.phase !== 'ended' ? (
        <details className="text-slate-400">
          <summary className="cursor-pointer">Show this screen on another device</summary>
          <p className="mt-2 text-sm">
            Open this link on the other screen. It gives control of the game, so do not share it
            with players.
          </p>
          <p data-testid="host-link" className="text-sm break-all text-slate-300">
            {hostScreenLink(origin, sessionId, hostKey)}
          </p>
        </details>
      ) : null}
    </main>
  );
}
