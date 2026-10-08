import type { Question, QuestionSet } from './question';

/** Builds a small valid multiple-choice question for tests. */
export function testQuestion(id: string, correct = 'right'): Question {
  return {
    id,
    type: 'multipleChoice',
    prompt: `Question ${id}?`,
    options: [
      { id: 'a', text: correct, isCorrect: true },
      { id: 'b', text: 'wrong one', isCorrect: false },
      { id: 'c', text: 'wrong two', isCorrect: false },
    ],
  };
}

/** A set of `count` test questions with ids q1, q2, … */
export function testSet(count: number): QuestionSet {
  return {
    id: 'test',
    title: 'Test',
    description: '',
    questions: Array.from({ length: count }, (_, index) => testQuestion(`q${index + 1}`)),
  };
}
