'use client';

import { defaultClimberSettings, defaultClimberTunables } from '@teckin/climber';
import { createSynthSoundPlayer } from '@teckin/engine-core';
import type { ClientGameShell, GameResults, QuestionSheetRequest } from '@teckin/game-contracts';
import { isSampleQuestionSetId, sampleQuestionSets } from '@teckin/questions';
import { LocalSession } from '@teckin/session';
import { QuestionSheet, ResultsScreen } from '@teckin/ui';
import { useEffect, useRef, useState } from 'react';

interface OpenSheet {
  request: QuestionSheetRequest;
  close: () => void;
}

interface ShownResults {
  results: GameResults;
  onPlayAgain: () => void;
}

/**
 * Client-only host for the Climber game. Phaser and the game code are fetched with a dynamic
 * import after the page has rendered, so they never run on the server and never load on any
 * other page. The page owns the platform side of solo play: a {@link LocalSession} with the
 * question set chosen by `?set=` (maths by default), the shared question sheet and results
 * screen, and synthesised sound.
 */
export function SoloGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<OpenSheet | undefined>();
  const [results, setResults] = useState<ShownResults | undefined>();
  const [shell, setShell] = useState<ClientGameShell | undefined>();

  useEffect(() => {
    const target = mountRef.current;
    if (!target) return;
    let unmount: (() => void) | undefined;
    let cancelled = false;
    const flags = Object.fromEntries(new URLSearchParams(window.location.search));
    const setId = isSampleQuestionSetId(flags.set) ? flags.set : 'maths';
    const session = new LocalSession({
      questionSet: sampleQuestionSets[setId],
      startingEnergy: defaultClimberTunables.startingEnergy,
      energyPerCorrectAnswer: defaultClimberSettings.energyPerCorrectAnswer,
    });
    const sound = createSynthSoundPlayer({
      storage: safeLocalStorage(),
      createContext: () => new AudioContext(),
    });
    // The first tap or key press unlocks audio (iPhones need a user gesture to start it).
    const unlockAudio = (): void => {
      sound.unlock();
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
    };
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);
    const gameShell: ClientGameShell = {
      session,
      sound,
      openQuestionSheet: (request) =>
        new Promise<void>((resolve) => {
          setSheet({
            request,
            close: () => {
              setSheet(undefined);
              resolve();
            },
          });
        }),
      showResults: (shown, onPlayAgain) => setResults({ results: shown, onPlayAgain }),
      hideResults: () => setResults(undefined),
      ...(flags.debug === '1'
        ? { debugCorrectOptionFor: (questionId: string) => session.correctOptionFor(questionId) }
        : {}),
      ...(flags.tune === '1' ? { tuning: session } : {}),
    };
    setShell(gameShell);

    import('@teckin/climber/client')
      .then((module) =>
        module.default.mount(target, {
          flags,
          assetBaseUrl: '/game-assets/climber/',
          themeId: process.env.NEXT_PUBLIC_CLIMBER_THEME,
          shell: gameShell,
        }),
      )
      .then((teardown) => {
        if (cancelled) teardown();
        else unmount = teardown;
      })
      .catch((error: unknown) => {
        console.error('The game failed to start', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
      unmount?.();
      setSheet(undefined);
      setResults(undefined);
    };
  }, []);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-surface">
      <div ref={mountRef} data-testid="game-root" className="absolute inset-0" />
      {shell && sheet ? (
        <QuestionSheet
          session={shell.session}
          request={sheet.request}
          onClose={sheet.close}
          sound={shell.sound}
        />
      ) : null}
      {results ? (
        <ResultsScreen results={results.results} onPlayAgain={results.onPlayAgain} />
      ) : null}
      {failed ? (
        <p role="alert" className="absolute inset-x-6 top-1/3 text-center text-lg">
          The game could not start on this device. Try reloading the page.
        </p>
      ) : null}
    </div>
  );
}

/** localStorage when the browser allows it; private modes can throw on access. */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
