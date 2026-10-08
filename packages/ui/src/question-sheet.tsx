import type {
  AnswerOutcome,
  GameSession,
  GameSoundPlayer,
  PresentedQuestion,
  QuestionSheetRequest,
} from '@teckin/game-contracts';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from './motion';

/** How long the right answer stays highlighted after a wrong answer (spec: 2 seconds). */
export const wrongAnswerRevealMs = 2000;
/** Pause after a correct answer before the next question, long enough to see the reward. */
export const correctAnswerPauseMs = 700;

/** Props for {@link QuestionSheet}. */
export interface QuestionSheetProps {
  session: GameSession;
  request: QuestionSheetRequest;
  /** Called when the player closes the sheet. */
  onClose: () => void;
  sound?: GameSoundPlayer;
  /** Overrides the system setting, for tests. */
  reducedMotion?: boolean;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'answering'; question: PresentedQuestion }
  | { kind: 'feedback'; question: PresentedQuestion; outcome: AnswerOutcome };

/**
 * Bottom sheet that asks questions until the player closes it. It covers about 60% of a
 * portrait screen, with large stacked answer buttons in thumb reach. A correct answer sends
 * the energy reward flying up toward the meter; a wrong one highlights the right answer for
 * two seconds. Plain HTML, so screen readers and text scaling work.
 */
export function QuestionSheet({
  session,
  request,
  onClose,
  sound,
  reducedMotion,
}: QuestionSheetProps) {
  const systemReducedMotion = usePrefersReducedMotion();
  const reduced = reducedMotion ?? systemReducedMotion;
  const { appearance, energyWord } = request;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [energy, setEnergy] = useState(session.energy);
  const [gainKey, setGainKey] = useState(0);
  const firstAnswerRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Blocks a second tap while an answer is being graded (state updates lag a tap).
  const busy = useRef(false);

  const loadQuestion = useCallback(async () => {
    const question = await session.currentQuestion();
    if (!mounted.current) return;
    busy.current = false;
    setPhase({ kind: 'answering', question });
  }, [session]);

  useEffect(() => {
    mounted.current = true;
    void loadQuestion();
    const stop = session.onEnergyChange((change) => setEnergy(change.energy));
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      stop();
    };
  }, [session, loadQuestion]);

  useEffect(() => {
    if (phase.kind === 'answering') firstAnswerRef.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const answer = async (question: PresentedQuestion, optionId: string): Promise<void> => {
    if (phase.kind !== 'answering' || busy.current) return;
    busy.current = true;
    const outcome = await session.submitAnswer(question.id, optionId);
    if (!mounted.current) return;
    setPhase({ kind: 'feedback', question, outcome });
    sound?.play(outcome.isCorrect ? 'correct' : 'wrong');
    if (outcome.isCorrect) setGainKey((key) => key + 1);
    timer.current = setTimeout(
      () => void loadQuestion(),
      outcome.isCorrect ? correctAnswerPauseMs : wrongAnswerRevealMs,
    );
  };

  const question = phase.kind === 'loading' ? undefined : phase.question;
  const outcome = phase.kind === 'feedback' ? phase.outcome : undefined;

  const optionStyle = (optionId: string): CSSProperties => {
    let background = `${appearance.text}14`;
    let border = `2px solid ${appearance.text}40`;
    if (outcome) {
      if (optionId === outcome.correctOptionId) {
        background = appearance.correct;
        border = `2px solid ${appearance.correct}`;
      } else if (optionId === outcome.chosenOptionId) {
        background = appearance.wrong;
        border = `2px solid ${appearance.wrong}`;
      }
    }
    return {
      display: 'block',
      width: '100%',
      minHeight: 56,
      padding: '10px 16px',
      borderRadius: 16,
      border,
      background,
      color: appearance.text,
      font: `600 20px/1.25 ${appearance.fontFamily}`,
      textAlign: 'left',
      touchAction: 'manipulation',
      transition: reduced ? 'none' : 'background 150ms ease',
      cursor: 'pointer',
    };
  };

  return (
    <div
      data-testid="question-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`Answer questions to get ${energyWord.toLowerCase()}`}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{sheetKeyframes}</style>
      <div aria-hidden="true" style={{ flex: '1 1 40%', background: `${appearance.panel}66` }} />
      <section
        data-question-id={question?.id ?? ''}
        style={{
          flex: '0 0 auto',
          minHeight: '60%',
          maxHeight: '100%',
          width: '100%',
          maxWidth: 640,
          margin: '0 auto',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding:
            '16px calc(env(safe-area-inset-right, 0px) + 16px) calc(env(safe-area-inset-bottom, 0px) + 16px) calc(env(safe-area-inset-left, 0px) + 16px)',
          borderRadius: '24px 24px 0 0',
          background: appearance.panel,
          color: appearance.text,
          fontFamily: appearance.fontFamily,
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.35)',
          animation: reduced ? 'none' : 'teckin-sheet-up 220ms ease-out',
          overflowY: 'auto',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          position: 'relative',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <p
            data-testid="sheet-energy"
            style={{
              margin: 0,
              flex: 1,
              font: `700 18px/1.2 ${appearance.fontFamily}`,
              color: appearance.accent,
            }}
          >
            {energyWord} {energy}
          </p>
          <button
            type="button"
            data-testid="close-sheet"
            onClick={onClose}
            style={{
              minHeight: 56,
              padding: '0 20px',
              borderRadius: 16,
              border: 'none',
              background: appearance.accent,
              color: appearance.panel,
              font: `700 18px ${appearance.fontFamily}`,
              touchAction: 'manipulation',
              cursor: 'pointer',
            }}
          >
            Back to climbing
          </button>
        </header>
        {question ? (
          <>
            <h2
              id="teckin-question-prompt"
              style={{ margin: '4px 0', font: `700 24px/1.3 ${appearance.fontFamily}` }}
            >
              {question.prompt}
            </h2>
            <div
              role="group"
              aria-labelledby="teckin-question-prompt"
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}
            >
              {question.options.map((option, index) => (
                <button
                  key={option.id}
                  ref={index === 0 ? firstAnswerRef : undefined}
                  type="button"
                  data-testid="answer-option"
                  data-option-id={option.id}
                  disabled={phase.kind !== 'answering'}
                  aria-pressed={outcome?.chosenOptionId === option.id}
                  onClick={() => void answer(question, option.id)}
                  style={optionStyle(option.id)}
                >
                  {option.text}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p style={{ margin: 'auto', font: `600 20px ${appearance.fontFamily}` }}>Loading…</p>
        )}
        <p
          data-testid="answer-feedback"
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            minHeight: 28,
            font: `700 20px/1.3 ${appearance.fontFamily}`,
            color: outcome
              ? outcome.isCorrect
                ? appearance.correct
                : appearance.text
              : appearance.textMuted,
          }}
        >
          {outcome
            ? outcome.isCorrect
              ? `Correct! +${outcome.energyGained} ${energyWord}`
              : `Not quite. The answer is ${outcome.correctAnswerText}.`
            : ''}
        </p>
        {outcome?.isCorrect ? (
          <span
            key={gainKey}
            data-testid="energy-gain"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 24,
              top: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: appearance.accent,
              color: appearance.panel,
              font: `800 20px ${appearance.fontFamily}`,
              pointerEvents: 'none',
              animation: reduced
                ? 'teckin-fade-out 700ms ease-out forwards'
                : 'teckin-energy-fly 700ms cubic-bezier(0.3, 0, 0.6, 1) forwards',
            }}
          >
            +{outcome.energyGained}
          </span>
        ) : null}
      </section>
    </div>
  );
}

const sheetKeyframes = `
@keyframes teckin-sheet-up { from { transform: translateY(30%); opacity: 0.4; } to { transform: none; opacity: 1; } }
@keyframes teckin-energy-fly {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(-8px, -55vh) scale(0.6); opacity: 0; }
}
@keyframes teckin-fade-out { from { opacity: 1; } to { opacity: 0; } }
`;
