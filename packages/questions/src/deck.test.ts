import { describe, expect, it } from 'vitest';
import { QuestionDeck } from './deck';
import { createSeededRandom } from './random';
import { testSet } from './testing';

const drawIds = (deck: QuestionDeck, count: number, wrong: ReadonlySet<string> = new Set()) => {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const question = deck.draw();
    ids.push(question.id);
    deck.recordResult(question.id, !wrong.has(question.id));
  }
  return ids;
};

describe('QuestionDeck', () => {
  it('shows every question once before any repeats, in a shuffled order', () => {
    const set = testSet(10);
    const deck = new QuestionDeck(set.questions, { random: createSeededRandom(7) });
    const firstCycle = drawIds(deck, 10);
    expect(new Set(firstCycle).size).toBe(10);
    expect(firstCycle).not.toEqual(set.questions.map((question) => question.id));
    const secondCycle = drawIds(deck, 10);
    expect(new Set(secondCycle).size).toBe(10);
  });

  it('never shows the same question twice in a row across cycles', () => {
    const deck = new QuestionDeck(testSet(3).questions, { random: createSeededRandom(1) });
    const ids = drawIds(deck, 60);
    for (let index = 1; index < ids.length; index += 1) expect(ids[index]).not.toBe(ids[index - 1]);
  });

  it('brings a wrongly answered question back after exactly 3 others', () => {
    const deck = new QuestionDeck(testSet(10).questions, { random: createSeededRandom(3) });
    const first = deck.draw();
    deck.recordResult(first.id, false);
    const next = drawIds(deck, 4);
    expect(next.slice(0, 3)).not.toContain(first.id);
    expect(next[3]).toBe(first.id);
  });

  it('keeps retrying a question while it is answered wrongly, then lets it go', () => {
    const deck = new QuestionDeck(testSet(12).questions, { random: createSeededRandom(5) });
    const target = deck.draw();
    deck.recordResult(target.id, false);
    const positions: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      const question = deck.draw();
      if (question.id === target.id) positions.push(index);
      // Wrong on the first retry, right on the second.
      deck.recordResult(question.id, !(question.id === target.id && positions.length === 1));
    }
    expect(positions).toEqual([3, 7]);
  });

  it('repeats a retried question early when the set is too small to wait', () => {
    const deck = new QuestionDeck(testSet(2).questions, { random: createSeededRandom(9) });
    const ids = drawIds(deck, 6, new Set(['q1', 'q2']));
    expect(ids).toHaveLength(6);
    expect(new Set(ids)).toEqual(new Set(['q1', 'q2']));
  });

  it('works with a single question', () => {
    const deck = new QuestionDeck(testSet(1).questions);
    expect(drawIds(deck, 3, new Set(['q1']))).toEqual(['q1', 'q1', 'q1']);
  });

  it('gives the same order for the same seed', () => {
    const questions = testSet(12).questions;
    const a = drawIds(new QuestionDeck(questions, { random: createSeededRandom(42) }), 24);
    const b = drawIds(new QuestionDeck(questions, { random: createSeededRandom(42) }), 24);
    expect(a).toEqual(b);
  });

  it('rejects an empty deck and unknown question ids', () => {
    expect(() => new QuestionDeck([])).toThrow(/at least one/);
    const deck = new QuestionDeck(testSet(2).questions);
    expect(() => deck.recordResult('nope', true)).toThrow(/Unknown question/);
  });
});
