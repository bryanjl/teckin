import { describe, expect, it } from 'vitest';
import {
  checkAuthoredQuestionSet,
  findQuestionProblems,
  questionSetReadiness,
  trueFalseOptions,
  type AuthoredQuestion,
} from './authoring';

const multipleChoice = (overrides: Partial<AuthoredQuestion> = {}): AuthoredQuestion => ({
  type: 'multipleChoice',
  prompt: 'What is 2 + 2?',
  options: [
    { text: '3', isCorrect: false },
    { text: '4', isCorrect: true },
  ],
  ...overrides,
});

describe('findQuestionProblems', () => {
  it('accepts multiple choice with 2 to 4 answers and one marked correct', () => {
    expect(findQuestionProblems(multipleChoice())).toEqual([]);
    const four = multipleChoice({
      options: ['1', '2', '3', '4'].map((text) => ({ text, isCorrect: text === '4' })),
    });
    expect(findQuestionProblems(four)).toEqual([]);
  });

  it('accepts true/false with True and False', () => {
    expect(
      findQuestionProblems({
        type: 'trueFalse',
        prompt: 'Fish swim.',
        options: trueFalseOptions(true),
      }),
    ).toEqual([]);
  });

  it('names each problem and where it is', () => {
    const problems = findQuestionProblems({
      type: 'multipleChoice',
      prompt: '  ',
      options: [
        { text: 'Same', isCorrect: false },
        { text: '', isCorrect: false },
        { text: 'same ', isCorrect: false },
      ],
    });
    expect(problems).toEqual([
      { field: 'prompt', message: 'The question is empty.' },
      { field: 'option-1', message: 'Answer 2 is empty.' },
      { field: 'option-2', message: 'Answers 1 and 3 are the same.' },
      { field: 'correct', message: 'Mark the correct answer.' },
    ]);
  });

  it('enforces answer counts, lengths and a single correct answer', () => {
    const one = multipleChoice({ options: [{ text: 'Only', isCorrect: true }] });
    expect(findQuestionProblems(one).map((problem) => problem.message)).toEqual([
      'Add at least 2 answers.',
    ]);
    const five = multipleChoice({
      options: ['a', 'b', 'c', 'd', 'e'].map((text) => ({ text, isCorrect: text === 'a' })),
    });
    expect(findQuestionProblems(five)[0]?.message).toMatch(/at most 4 answers/);
    const twoCorrect = multipleChoice({
      options: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: true },
      ],
    });
    expect(findQuestionProblems(twoCorrect)).toEqual([
      { field: 'correct', message: 'Mark only one correct answer.' },
    ]);
    expect(findQuestionProblems(multipleChoice({ prompt: 'x'.repeat(301) }))[0]?.message).toMatch(
      /too long \(301 characters/,
    );
    const longAnswer = multipleChoice({
      options: [
        { text: 'y'.repeat(201), isCorrect: true },
        { text: 'n', isCorrect: false },
      ],
    });
    expect(findQuestionProblems(longAnswer)[0]?.field).toBe('option-0');
  });

  it('rejects a true/false question with other answers', () => {
    const problems = findQuestionProblems({
      type: 'trueFalse',
      prompt: 'Fish swim.',
      options: [
        { text: 'Yes', isCorrect: true },
        { text: 'No', isCorrect: false },
      ],
    });
    expect(problems.map((problem) => problem.field)).toEqual(['options']);
  });
});

describe('questionSetReadiness', () => {
  it('needs 5 questions to play', () => {
    expect(questionSetReadiness(0)).toEqual({ playable: false, questionsNeeded: 5 });
    expect(questionSetReadiness(4)).toEqual({ playable: false, questionsNeeded: 1 });
    expect(questionSetReadiness(5)).toEqual({ playable: true, questionsNeeded: 0 });
  });
});

describe('checkAuthoredQuestionSet', () => {
  it('trims text and saves a set with fewer than 5 questions (it is just not playable yet)', () => {
    const result = checkAuthoredQuestionSet({
      title: '  Maths  ',
      questions: [multipleChoice({ prompt: '  What is 2 + 2?  ' })],
    });
    expect(result).toEqual({
      ok: true,
      set: {
        title: 'Maths',
        description: '',
        questions: [multipleChoice()],
      },
    });
  });

  it('points each problem at its question', () => {
    const result = checkAuthoredQuestionSet({
      title: '',
      description: 'ok',
      questions: [multipleChoice(), multipleChoice({ prompt: '' })],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([
      { questionIndex: null, field: 'title', message: 'Give the set a title.' },
      { questionIndex: 1, field: 'prompt', message: 'The question is empty.' },
    ]);
  });

  it('rejects input that is not a question set at all', () => {
    expect(checkAuthoredQuestionSet({ title: 'x', questions: [{ type: 'essay' }] }).ok).toBe(false);
    expect(checkAuthoredQuestionSet(null).ok).toBe(false);
    const tooMany = Array.from({ length: 501 }, () => multipleChoice());
    const result = checkAuthoredQuestionSet({ title: 'Big', questions: tooMany });
    expect(result.ok).toBe(false);
  });
});
