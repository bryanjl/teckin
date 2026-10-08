import { describe, expect, it } from 'vitest';
import { gradeAnswer } from './grading';
import { testQuestion } from './testing';

describe('gradeAnswer', () => {
  const question = testQuestion('q1');

  it('marks the correct option as correct', () => {
    expect(gradeAnswer(question, 'a', 1234.4)).toEqual({
      questionId: 'q1',
      chosenOptionId: 'a',
      correctOptionId: 'a',
      isCorrect: true,
      millisecondsTaken: 1234,
    });
  });

  it('marks any other option as wrong and names the right one', () => {
    expect(gradeAnswer(question, 'c', 50)).toMatchObject({
      isCorrect: false,
      correctOptionId: 'a',
    });
  });

  it('rejects an option that is not part of the question', () => {
    expect(() => gradeAnswer(question, 'z', 10)).toThrow(/not part of question/);
  });

  it('never records a negative or invalid time', () => {
    expect(gradeAnswer(question, 'a', -20).millisecondsTaken).toBe(0);
    expect(gradeAnswer(question, 'a', Number.NaN).millisecondsTaken).toBe(0);
  });
});
