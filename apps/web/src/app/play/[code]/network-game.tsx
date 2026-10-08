'use client';

import type { Room } from '@colyseus/sdk';
import { createSynthSoundPlayer } from '@teckin/engine-core';
import {
  clientRequestTypes,
  roomCloseCodes,
  type ClientGameShell,
  type GameResults,
  type QuestionSheetRequest,
  type RoomStateView,
  type WelcomeMessage,
} from '@teckin/game-contracts';
import { NetworkSession, sdkRoomConnection, type SdkRoomLike } from '@teckin/session';
import { QuestionSheet, ResultsScreen } from '@teckin/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  deviceKey,
  nicknameStorageKey,
  readStored,
  safeStorage,
} from '../../../lib/browser-storage';
import {
  describeJoinProblem,
  joinProblemFromError,
  lookupJoinCode,
  realtimeUrl,
} from '../../../lib/join';
import { joinAsPlayer, takeHandedOverRoom } from '../../../lib/realtime';
import { liveRoomViewOf, sameLiveRoomView, type LiveRoomView } from './live-room-view';

interface OpenSheet {
  request: QuestionSheetRequest;
  close: () => void;
}

/** Why the page cannot show the game, with whether rejoining could help. */
interface Problem {
  message: string;
  canRetry: boolean;
}

/** Message for the room closing this connection, by close code; `null` for a normal leave. */
function problemForLeave(code: number): Problem | null {
  switch (code) {
    case roomCloseCodes.kicked:
      return { message: 'The host removed you from this game.', canRetry: false };
    case roomCloseCodes.gameDisposed:
      return { message: 'This game has closed.', canRetry: false };
    case roomCloseCodes.replaced:
      return { message: 'This game is now open in another tab or window.', canRetry: true };
    case 1000:
      return null;
    default:
      return { message: 'Lost the connection to the game.', canRetry: true };
  }
}

/**
 * A live multiplayer game on a player's device. Takes the room `/join` joined (or, after a
 * reload, rejoins with this browser's device key), connects a {@link NetworkSession}, mounts
 * the Climber with a shell around it, and shows the platform's own screens from the room's
 * state: the lobby, the 3-2-1 countdown, reconnecting, and the shared results at the end.
 */
export function NetworkGame({ code }: { code: string }) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<OpenSheet | undefined>(undefined);
  const [sheet, setSheet] = useState<OpenSheet | undefined>();
  const [results, setResults] = useState<GameResults | undefined>();
  const [shell, setShell] = useState<ClientGameShell | undefined>();
  const [view, setView] = useState<LiveRoomView | undefined>();
  const [problem, setProblem] = useState<Problem | undefined>();
  const [reconnecting, setReconnecting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const target = mountRef.current;
    if (!target) return;
    let cancelled = false;
    let room: Room | undefined;
    let session: NetworkSession | undefined;
    let unmount: (() => void) | undefined;
    let ended = false;
    const cleanups: (() => void)[] = [];
    const flags = Object.fromEntries(new URLSearchParams(window.location.search));
    const baseUrl = realtimeUrl(window.location);
    setProblem(undefined);

    const showSheet = (next: OpenSheet | undefined): void => {
      sheetRef.current = next;
      setSheet(next);
    };

    const start = async (): Promise<void> => {
      room = takeHandedOverRoom(code);
      if (!room) {
        const nickname = readStored(safeStorage('session'), nicknameStorageKey(code));
        if (!nickname) {
          router.replace(`/join?code=${encodeURIComponent(code)}`);
          return;
        }
        const found = await lookupJoinCode(baseUrl, code);
        if (!found.ok) {
          setProblem({ message: describeJoinProblem(found.problem), canRetry: false });
          return;
        }
        try {
          room = await joinAsPlayer(baseUrl, found.roomId, { nickname, deviceKey: deviceKey() });
        } catch (error) {
          setProblem({
            message: describeJoinProblem(joinProblemFromError(error)),
            canRetry: false,
          });
          return;
        }
      }
      if (cancelled) {
        void room.leave(true);
        return;
      }
      const joined = room;
      const welcome = (await joined.request(clientRequestTypes.whoAmI)) as WelcomeMessage;
      session = await NetworkSession.connect(
        sdkRoomConnection(joined as unknown as SdkRoomLike),
        welcome.playerId,
      );
      if (cancelled) return;
      const networkSession = session;

      let shownView: LiveRoomView | undefined;
      const onState = (state: unknown): void => {
        if (!state) return;
        const next = liveRoomViewOf(state as RoomStateView, welcome.playerId);
        if (next.phase === 'ended' && !ended) {
          ended = true;
          // The game is over: an open question sheet has nothing left to answer.
          sheetRef.current?.close();
        }
        if (sameLiveRoomView(shownView, next)) return;
        shownView = next;
        setView(next);
      };
      joined.onStateChange(onState);
      cleanups.push(() => joined.onStateChange.remove(onState));
      onState(joined.state);

      const onDrop = (): void => setReconnecting(true);
      const onReconnect = (): void => {
        setReconnecting(false);
        void networkSession.resync();
      };
      const onLeave = (closeCode: number): void => {
        setReconnecting(false);
        if (cancelled) return;
        const leaveProblem = problemForLeave(closeCode);
        // After the end, the room closing later is expected; keep the results on screen.
        if (leaveProblem && !(ended && closeCode === roomCloseCodes.gameDisposed)) {
          setProblem(leaveProblem);
        }
      };
      joined.onDrop(onDrop);
      joined.onReconnect(onReconnect);
      joined.onLeave(onLeave);
      cleanups.push(() => {
        joined.onDrop.remove(onDrop);
        joined.onReconnect.remove(onReconnect);
        joined.onLeave.remove(onLeave);
      });

      const sound = createSynthSoundPlayer({
        storage: safeStorage('local'),
        createContext: () => new AudioContext(),
      });
      const unlockAudio = (): void => {
        sound.unlock();
        window.removeEventListener('pointerdown', unlockAudio, true);
        window.removeEventListener('keydown', unlockAudio, true);
      };
      window.addEventListener('pointerdown', unlockAudio, true);
      window.addEventListener('keydown', unlockAudio, true);
      cleanups.push(() => {
        window.removeEventListener('pointerdown', unlockAudio, true);
        window.removeEventListener('keydown', unlockAudio, true);
      });

      const gameShell: ClientGameShell = {
        session: networkSession,
        sound,
        openQuestionSheet: (request) =>
          new Promise<void>((resolve) => {
            showSheet({
              request,
              close: () => {
                showSheet(undefined);
                resolve();
              },
            });
          }),
        showResults: (shown) => setResults(shown),
        hideResults: () => setResults(undefined),
      };
      setShell(gameShell);

      const climberClient = await import('@teckin/climber/client');
      if (cancelled) return;
      const teardown = await climberClient.default.mount(target, {
        flags,
        assetBaseUrl: '/game-assets/climber/',
        themeId: process.env.NEXT_PUBLIC_CLIMBER_THEME,
        shell: gameShell,
      });
      if (cancelled) teardown();
      else unmount = teardown;
    };

    start().catch((error: unknown) => {
      console.error('The live game failed to start', error);
      if (!cancelled) {
        setProblem({ message: 'The game could not start on this device.', canRetry: true });
      }
    });

    return () => {
      cancelled = true;
      unmount?.();
      for (const cleanup of cleanups.reverse()) cleanup();
      session?.dispose();
      void room?.leave(true);
      showSheet(undefined);
      setResults(undefined);
      setView(undefined);
    };
  }, [code, router, attempt]);

  const inLobby = view?.phase === 'lobby';
  const countingDown = view?.phase === 'countdown';

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-surface">
      <div
        ref={mountRef}
        data-testid="game-root"
        data-room-phase={view?.phase ?? 'connecting'}
        className="absolute inset-0"
      />
      {!view && !problem ? (
        <p
          data-testid="connecting"
          className="absolute inset-x-6 top-1/3 z-40 text-center text-xl font-semibold"
        >
          Joining game…
        </p>
      ) : null}
      {inLobby && !problem ? <LobbyCard view={view} /> : null}
      {countingDown && !problem ? (
        <div
          data-testid="countdown"
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-surface/40"
        >
          <span aria-live="assertive" className="text-[9rem] font-black leading-none text-accent">
            {view.countdownSeconds}
          </span>
        </div>
      ) : null}
      {reconnecting && !problem ? (
        <p
          role="status"
          data-testid="reconnecting"
          className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+84px)] z-40 mx-auto w-fit rounded-2xl bg-surface-raised px-5 py-3 text-lg font-semibold"
        >
          Reconnecting…
        </p>
      ) : null}
      {shell && sheet ? (
        <QuestionSheet
          session={shell.session}
          request={sheet.request}
          onClose={sheet.close}
          sound={shell.sound}
        />
      ) : null}
      {results ? (
        <ResultsScreen
          results={results}
          actionLabel="Join another game"
          onPlayAgain={() => router.push('/join')}
        />
      ) : null}
      {problem ? (
        <div
          role="alert"
          data-testid="live-problem"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-surface px-6 text-center"
        >
          <p className="text-2xl font-semibold">{problem.message}</p>
          {problem.canRetry ? (
            <button
              type="button"
              className="min-h-touch rounded-2xl bg-accent px-8 text-xl font-bold text-accent-ink"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Rejoin
            </button>
          ) : null}
          <button
            type="button"
            className="min-h-touch rounded-2xl border-2 border-accent px-8 text-lg font-semibold text-accent"
            onClick={() => router.push('/join')}
          >
            Join another game
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Most nicknames listed in the lobby card; the rest are counted. */
const lobbyNamesShown = 24;

/** The lobby: who this player is, who else is here, and that the host starts the game. */
function LobbyCard({ view }: { view: LiveRoomView }) {
  const others = view.nicknames.length - 1;
  const extra = view.nicknames.length - lobbyNamesShown;
  return (
    <div
      data-testid="lobby"
      className="absolute inset-x-0 bottom-0 z-40 max-h-[70dvh] overflow-y-auto rounded-t-3xl bg-surface-raised/95 px-5 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-center"
    >
      <p className="text-lg text-ink-muted">You&apos;re in!</p>
      <p data-testid="lobby-nickname" className="mt-1 text-3xl font-bold break-words">
        {view.ownNickname}
      </p>
      <p className="mt-3 text-lg">Waiting for the host to start the game…</p>
      <p data-testid="lobby-count" className="mt-4 text-ink-muted">
        {others === 0
          ? 'No one else yet'
          : `${others} other ${others === 1 ? 'player' : 'players'}`}
      </p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Players">
        {view.nicknames.slice(0, lobbyNamesShown).map((name, index) => (
          <li
            key={name}
            className={`rounded-full px-3 py-1 text-base ${index === 0 ? 'bg-accent font-bold text-accent-ink' : 'bg-surface text-ink'}`}
          >
            {name}
          </li>
        ))}
        {extra > 0 ? <li className="px-3 py-1 text-ink-muted">and {extra} more</li> : null}
      </ul>
    </div>
  );
}
