import { LocalSession } from '@teckin/session';
import { createSeededRandom, sampleQuestionSets } from '@teckin/questions';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionSheet, wrongAnswerRevealMs } from './question-sheet';
import { ResultsScreen, formatResultTime } from './results-screen';
import { testAppearance } from './testing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const session = () =>
  new LocalSession({
    questionSet: sampleQuestionSets.maths,
    startingEnergy: 50,
    energyPerCorrectAnswer: 100,
    random: createSeededRandom(5),
  });

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const sheetQuestionId = () =>
  container.querySelector('[data-question-id]')?.getAttribute('data-question-id') ?? '';
const optionButton = (optionId: string) =>
  container.querySelector<HTMLButtonElement>(`[data-option-id="${optionId}"]`);

describe('QuestionSheet', () => {
  it('asks a question and adds energy for a correct answer', async () => {
    const play = session();
    const sounds: string[] = [];
    const sound = {
      play: (name: string) => sounds.push(name),
      muted: false,
      setMuted: () => {},
      onMutedChange: () => () => {},
      unlock: () => {},
    };
    await act(async () => {
      root.render(
        <QuestionSheet
          session={play}
          request={{ energyWord: 'Energy', appearance: testAppearance }}
          onClose={() => {}}
          sound={sound}
          reducedMotion
        />,
      );
    });
    await flush();
    const id = sheetQuestionId();
    expect(id).not.toBe('');
    expect(
      container.querySelectorAll('[data-testid="answer-option"]').length,
    ).toBeGreaterThanOrEqual(2);
    await act(async () => optionButton(play.correctOptionFor(id))?.click());
    await flush();
    expect(container.querySelector('[data-testid="answer-feedback"]')?.textContent).toBe(
      'Correct! +100 Energy',
    );
    expect(container.querySelector('[data-testid="sheet-energy"]')?.textContent).toBe('Energy 150');
    expect(play.energy).toBe(150);
    expect(sounds).toEqual(['correct']);
  });

  it('shows the right answer for 2 seconds after a wrong one, then moves on', async () => {
    vi.useFakeTimers();
    const play = session();
    await act(async () => {
      root.render(
        <QuestionSheet
          session={play}
          request={{ energyWord: 'Energy', appearance: testAppearance }}
          onClose={() => {}}
          reducedMotion
        />,
      );
    });
    await flush();
    const id = sheetQuestionId();
    const correct = play.correctOptionFor(id);
    const wrong = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="answer-option"]'),
    ].find((button) => button.dataset.optionId !== correct);
    await act(async () => wrong?.click());
    await flush();
    expect(container.querySelector('[data-testid="answer-feedback"]')?.textContent).toMatch(
      /^Not quite\. The answer is /,
    );
    expect(optionButton(correct)?.disabled).toBe(true);
    expect(play.energy).toBe(50);
    await act(async () => vi.advanceTimersByTime(wrongAnswerRevealMs - 50));
    expect(sheetQuestionId()).toBe(id);
    await act(async () => vi.advanceTimersByTime(100));
    await flush();
    expect(sheetQuestionId()).not.toBe(id);
  });

  it('closes with the close button and with Escape', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <QuestionSheet
          session={session()}
          request={{ energyWord: 'Energy', appearance: testAppearance }}
          onClose={onClose}
          reducedMotion
        />,
      );
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="close-sheet"]')?.click(),
    );
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ResultsScreen', () => {
  it('shows time, stats, answers, accuracy and missed questions', async () => {
    const onPlayAgain = vi.fn();
    await act(async () => {
      root.render(
        <ResultsScreen
          results={{
            title: 'Course complete',
            elapsedSeconds: 543.21,
            stats: [{ label: 'Summits reached', value: '6 of 6' }],
            answers: {
              answered: 8,
              correct: 6,
              accuracy: 0.75,
              missed: [
                {
                  questionId: 'maths-001',
                  prompt: 'What is 6 × 7?',
                  correctAnswer: '42',
                  timesMissed: 1,
                },
              ],
            },
            appearance: testAppearance,
          }}
          onPlayAgain={onPlayAgain}
        />,
      );
    });
    const text = (testId: string) =>
      container.querySelector(`[data-testid="${testId}"]`)?.textContent;
    expect(text('results-time')).toBe('Time 9:03.2');
    expect(text('result-summits-reached')).toBe('6 of 6');
    expect(text('result-questions-answered')).toBe('8');
    expect(text('result-accuracy')).toBe('75%');
    expect(text('missed-questions')).toContain('What is 6 × 7?');
    expect(text('missed-questions')).toContain('Answer: 42');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="play-again-button"]')?.click(),
    );
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it('formats times as minutes, seconds and tenths', () => {
    expect(formatResultTime(0)).toBe('0:00.0');
    expect(formatResultTime(65.49)).toBe('1:05.4');
  });
});
