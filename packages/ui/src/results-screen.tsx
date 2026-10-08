import type { GameResults } from '@teckin/game-contracts';
import { useEffect, useRef } from 'react';

/** Props for {@link ResultsScreen}. */
export interface ResultsScreenProps {
  results: GameResults;
  onPlayAgain: () => void;
}

/** Formats seconds as m:ss.t, e.g. 83.42 → "1:23.4". */
export function formatResultTime(seconds: number): string {
  const tenths = Math.max(0, Math.floor(seconds * 10));
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

/**
 * End-of-game screen shared by every game: time, the game's own stats, questions answered,
 * accuracy, and every missed question with its correct answer.
 */
export function ResultsScreen({ results, onPlayAgain }: ResultsScreenProps) {
  const { appearance, answers } = results;
  const playAgainRef = useRef<HTMLButtonElement>(null);
  useEffect(() => playAgainRef.current?.focus({ preventScroll: true }), []);
  const accuracy = answers.answered === 0 ? '–' : `${Math.round(answers.accuracy * 100)}%`;
  const rows = [
    ...results.stats,
    { label: 'Questions answered', value: String(answers.answered) },
    { label: 'Accuracy', value: accuracy },
  ];

  return (
    <div
      data-testid="results-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teckin-results-title"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 45,
        overflowY: 'auto',
        touchAction: 'pan-y',
        overscrollBehavior: 'contain',
        background: `${appearance.panel}f2`,
        color: appearance.text,
        fontFamily: appearance.fontFamily,
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding:
            'calc(env(safe-area-inset-top, 0px) + 24px) calc(env(safe-area-inset-right, 0px) + 20px) calc(env(safe-area-inset-bottom, 0px) + 24px) calc(env(safe-area-inset-left, 0px) + 20px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h2
          id="teckin-results-title"
          style={{ margin: 0, font: `800 32px/1.2 ${appearance.fontFamily}`, textAlign: 'center' }}
        >
          {results.title}
        </h2>
        <p
          data-testid="results-time"
          style={{
            margin: 0,
            textAlign: 'center',
            font: `700 24px ${appearance.fontFamily}`,
            color: appearance.accent,
          }}
        >
          Time {formatResultTime(results.elapsedSeconds)}
        </p>
        <dl
          data-testid="results-stats"
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '8px 16px',
            fontSize: 18,
          }}
        >
          {rows.map((row) => (
            <div key={row.label} style={{ display: 'contents' }}>
              <dt style={{ color: appearance.textMuted }}>{row.label}</dt>
              <dd
                data-testid={`result-${slug(row.label)}`}
                style={{ margin: 0, fontWeight: 700, textAlign: 'right' }}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <button
          ref={playAgainRef}
          type="button"
          data-testid="play-again-button"
          onClick={onPlayAgain}
          style={{
            alignSelf: 'center',
            minWidth: 180,
            minHeight: 56,
            padding: '0 28px',
            borderRadius: 16,
            border: 'none',
            background: appearance.accent,
            color: appearance.panel,
            font: `700 20px ${appearance.fontFamily}`,
            touchAction: 'manipulation',
            cursor: 'pointer',
          }}
        >
          Play again
        </button>
        <section aria-labelledby="teckin-missed-title">
          <h3
            id="teckin-missed-title"
            style={{ margin: '8px 0', font: `700 20px ${appearance.fontFamily}` }}
          >
            {answers.missed.length === 0 ? 'No missed questions' : 'Questions to look at again'}
          </h3>
          <ul
            data-testid="missed-questions"
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}
          >
            {answers.missed.map((missed) => (
              <li
                key={missed.questionId}
                data-question-id={missed.questionId}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: `${appearance.text}12`,
                }}
              >
                <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{missed.prompt}</p>
                <p style={{ margin: '4px 0 0', color: appearance.correct, fontSize: 17 }}>
                  Answer: {missed.correctAnswer}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
