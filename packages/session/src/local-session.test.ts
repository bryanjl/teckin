import { createSeededRandom, sampleQuestionSets } from '@teckin/questions';
import { describe, expect, it } from 'vitest';
import { LocalSession } from './local-session';

const create = () =>
  new LocalSession({
    questionSet: sampleQuestionSets.maths,
    startingEnergy: 50,
    energyPerCorrectAnswer: 100,
    random: createSeededRandom(11),
  });

const wrongOption = async (session: LocalSession, questionId: string) => {
  const question = await session.currentQuestion();
  const correct = session.correctOptionFor(questionId);
  const wrong = question.options.find((option) => option.id !== correct);
  if (!wrong) throw new Error('no wrong option');
  return wrong.id;
};

describe('LocalSession energy accounting', () => {
  it('starts with the starting energy', () => {
    expect(create().energy).toBe(50);
  });

  it('adds energy only for correct answers', async () => {
    const session = create();
    const first = await session.currentQuestion();
    const right = await session.submitAnswer(first.id, session.correctOptionFor(first.id));
    expect(right).toMatchObject({ isCorrect: true, energyGained: 100, energy: 150 });
    const second = await session.currentQuestion();
    const wrong = await session.submitAnswer(second.id, await wrongOption(session, second.id));
    expect(wrong).toMatchObject({ isCorrect: false, energyGained: 0, energy: 150 });
    expect(wrong.correctAnswerText.length).toBeGreaterThan(0);
  });

  it('spends only what the player has and never goes below zero', () => {
    const session = create();
    expect(session.spendEnergy(10, 'jump')).toBe(true);
    expect(session.energy).toBe(40);
    expect(session.spendEnergy(41, 'jump')).toBe(false);
    expect(session.energy).toBe(40);
    expect(session.spendEnergy(40, 'walk')).toBe(true);
    expect(session.energy).toBe(0);
    expect(session.spendEnergy(1, 'walk')).toBe(false);
    expect(() => session.spendEnergy(-5, 'walk')).toThrow();
  });

  it('notifies listeners of every change with its reason', async () => {
    const session = create();
    const changes: unknown[] = [];
    const stop = session.onEnergyChange((change) => changes.push(change));
    session.spendEnergy(15, 'airJump');
    const question = await session.currentQuestion();
    await session.submitAnswer(question.id, session.correctOptionFor(question.id));
    stop();
    session.spendEnergy(1, 'walk');
    expect(changes).toEqual([
      { energy: 35, delta: -15, reason: 'airJump' },
      { energy: 135, delta: 100, reason: 'answer' },
    ]);
  });

  it('summarises answers and resets to a fresh run', async () => {
    const session = create();
    const question = await session.currentQuestion();
    await session.submitAnswer(question.id, await wrongOption(session, question.id));
    expect(session.answerSummary()).toMatchObject({ answered: 1, correct: 0 });
    expect(session.answerSummary().missed).toHaveLength(1);
    session.spendEnergy(20, 'jump');
    session.reportProgress({ type: 'goalReached', goalIndex: 0, elapsedSeconds: 30 });
    session.reset();
    expect(session.energy).toBe(50);
    expect(session.answerSummary().answered).toBe(0);
    expect(session.progress()).toEqual([]);
  });
});
