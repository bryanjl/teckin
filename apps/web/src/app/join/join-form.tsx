'use client';

import { describeNicknameProblem, generateNickname, reviewNickname } from '@teckin/nicknames';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  deviceKey,
  nicknameStorageKey,
  readStored,
  safeStorage,
  writeStored,
} from '../../lib/browser-storage';
import {
  describeJoinProblem,
  isJoinCode,
  joinProblemFromError,
  lookupJoinCode,
  normaliseJoinCode,
  realtimeUrl,
  type JoinProblem,
} from '../../lib/join';
import { handOverRoom, joinAsPlayer } from '../../lib/realtime';

type Step = { name: 'code' } | { name: 'nickname'; code: string; roomId: string };

/** Problems that mean the code itself is the trouble, so the form goes back to the code. */
const codeProblems: readonly JoinProblem[] = [
  'unknownCode',
  'gameEnded',
  'lateJoinClosed',
  'locked',
  'roomFull',
  'kicked',
];

const inputClass =
  'min-h-touch w-full rounded-2xl border-2 border-ink-muted/40 bg-surface-raised px-4 text-center text-2xl font-bold text-ink outline-none focus:border-accent';
const primaryButtonClass =
  'min-h-touch w-full rounded-2xl bg-accent px-6 text-xl font-bold text-accent-ink disabled:opacity-60';
const secondaryButtonClass =
  'min-h-touch w-full rounded-2xl border-2 border-accent px-6 text-lg font-semibold text-accent disabled:opacity-60';

/**
 * The two-step join form. Step one resolves the 6-digit code with the realtime server; step
 * two takes a nickname (checked here with the same rules the server uses) or makes a random
 * one, joins the room and hands it to the play page. `?code=` skips to step two.
 */
export function JoinForm({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'code' });
  const [codeInput, setCodeInput] = useState(initialCode);
  const [nickname, setNickname] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(() => isJoinCode(initialCode));
  const nicknameRef = useRef<HTMLInputElement>(null);

  /** Shows the outcome of looking a code up: the nickname step, or what went wrong. */
  const applyLookup = (code: string, found: Awaited<ReturnType<typeof lookupJoinCode>>): void => {
    setBusy(false);
    if (!found.ok) {
      setProblem(describeJoinProblem(found.problem));
      return;
    }
    const remembered = readStored(safeStorage('session'), nicknameStorageKey(code));
    if (remembered) setNickname(remembered);
    setStep({ name: 'nickname', code, roomId: found.roomId });
  };

  const findGame = async (code: string): Promise<void> => {
    setProblem(null);
    if (!isJoinCode(code)) {
      setProblem('Game codes have 6 numbers.');
      return;
    }
    setBusy(true);
    applyLookup(code, await lookupJoinCode(realtimeUrl(window.location), code));
  };

  useEffect(() => {
    if (!isJoinCode(initialCode)) return;
    let active = true;
    void lookupJoinCode(realtimeUrl(window.location), initialCode).then((found) => {
      if (active) applyLookup(initialCode, found);
    });
    return () => {
      active = false;
    };
    // Only the code the page opened with is looked up automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step.name === 'nickname') nicknameRef.current?.focus();
  }, [step]);

  const submitCode = (event: FormEvent): void => {
    event.preventDefault();
    void findGame(normaliseJoinCode(codeInput));
  };

  const submitNickname = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (step.name !== 'nickname') return;
    const review = reviewNickname(nickname);
    if (!review.ok) {
      setProblem(describeNicknameProblem(review.problem));
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const room = await joinAsPlayer(realtimeUrl(window.location), step.roomId, {
        nickname: review.nickname,
        deviceKey: deviceKey(),
      });
      writeStored(safeStorage('session'), nicknameStorageKey(step.code), review.nickname);
      handOverRoom(step.code, room);
      router.push(`/play/${step.code}`);
    } catch (error) {
      setBusy(false);
      const joinProblem = joinProblemFromError(error);
      setProblem(describeJoinProblem(joinProblem));
      if (codeProblems.includes(joinProblem)) setStep({ name: 'code' });
    }
  };

  const problemMessage = problem ? (
    <p role="alert" data-testid="join-problem" className="text-center text-lg text-danger">
      {problem}
    </p>
  ) : null;

  if (step.name === 'code') {
    return (
      <form onSubmit={submitCode} className="flex flex-col gap-4" data-testid="join-code-step">
        <label htmlFor="join-code" className="text-center text-lg text-ink-muted">
          Type the game code you can see on the host&apos;s screen.
        </label>
        <input
          id="join-code"
          data-testid="join-code-input"
          className={`${inputClass} tracking-[0.3em]`}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={9}
          placeholder="123456"
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value.replace(/[^\d\s-]/g, ''))}
        />
        {problemMessage}
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? 'Finding game…' : 'Next'}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => void submitNickname(event)}
      className="flex flex-col gap-4"
      data-testid="join-nickname-step"
    >
      <p className="text-center text-ink-muted">
        Game <span className="font-bold text-ink">{step.code}</span>
      </p>
      <label htmlFor="join-nickname" className="text-center text-lg">
        Pick a nickname. Do not use your real name.
      </label>
      <input
        ref={nicknameRef}
        id="join-nickname"
        data-testid="nickname-input"
        className={inputClass}
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={16}
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
      />
      <button
        type="button"
        data-testid="random-name-button"
        className={secondaryButtonClass}
        disabled={busy}
        onClick={() => {
          setProblem(null);
          setNickname((current) => generateNickname(Math.random, [current]));
        }}
      >
        Random name
      </button>
      {problemMessage}
      <button
        type="submit"
        data-testid="join-button"
        className={primaryButtonClass}
        disabled={busy}
      >
        {busy ? 'Joining…' : 'Join'}
      </button>
      <button
        type="button"
        className="min-h-touch text-ink-muted underline"
        onClick={() => {
          setProblem(null);
          setStep({ name: 'code' });
        }}
      >
        Use a different code
      </button>
    </form>
  );
}
