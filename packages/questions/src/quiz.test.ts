import { describe, expect, it } from 'vitest';
import { QuestionQuiz } from './quiz';
import { createSeededRandom } from './random';
import { testSet } from './testing';

describe('QuestionQuiz', () => {
  it('keeps the same question until it is answered', () => {
    const quiz = new QuestionQuiz(testSet(5), { random: createSeededRandom(2) });
    const first = quiz.currentQuestion();
    expect(quiz.currentQuestion()).toBe(first);
    quiz.submitAnswer(first.id, 'a');
    expect(quiz.currentQuestion().id).not.toBe(first.id);
  });

  it('times answers from when the question was first shown', () => {
    let clock = 1_000;
    const quiz = new QuestionQuiz(testSet(3), { now: () => clock });
    const question = quiz.currentQuestion();
    clock += 2_500;
    expect(quiz.submitAnswer(question.id, 'a').millisecondsTaken).toBe(2_500);
  });

  it('restarts the timer when the question is shown again after closing the sheet', () => {
    let clock = 0;
    const quiz = new QuestionQuiz(testSet(3), { now: () => clock });
    const question = quiz.currentQuestion();
    clock += 300_000;
    quiz.currentQuestion();
    clock += 4_000;
    expect(quiz.submitAnswer(question.id, 'a').millisecondsTaken).toBe(4_000);
  });

  it('refuses an answer for a question that is not being asked', () => {
    const quiz = new QuestionQuiz(testSet(3));
    expect(() => quiz.submitAnswer('q1', 'a')).toThrow(/not the one being asked/);
    const question = quiz.currentQuestion();
    quiz.submitAnswer(question.id, 'a');
    expect(() => quiz.submitAnswer(question.id, 'a')).toThrow();
  });

  it('summarises answers, accuracy and missed questions with their correct answers', () => {
    const quiz = new QuestionQuiz(testSet(6), { random: createSeededRandom(4) });
    const missedIds: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const question = quiz.currentQuestion();
      const wrong = index === 0 || index === 2;
      if (wrong) missedIds.push(question.id);
      quiz.submitAnswer(question.id, wrong ? 'b' : 'a');
    }
    const summary = quiz.summary();
    expect(summary).toMatchObject({ answered: 8, correct: 6, accuracy: 0.75 });
    expect(summary.missed.map((missed) => missed.questionId)).toEqual(missedIds);
    expect(summary.missed[0]).toMatchObject({ correctAnswer: 'right', timesMissed: 1 });
    expect(quiz.answers()).toHaveLength(8);
  });

  it('shuffles multiple-choice options but keeps true/false in order', () => {
    const quiz = new QuestionQuiz(
      {
        id: 's',
        title: 'S',
        description: '',
        questions: [
          {
            id: 'tf',
            type: 'trueFalse',
            prompt: 'Sky is blue?',
            options: [
              { id: 'true', text: 'True', isCorrect: true },
              { id: 'false', text: 'False', isCorrect: false },
            ],
          },
        ],
      },
      { random: createSeededRandom(1) },
    );
    for (let index = 0; index < 5; index += 1) {
      const question = quiz.currentQuestion();
      expect(question.options.map((option) => option.id)).toEqual(['true', 'false']);
      quiz.submitAnswer(question.id, 'true');
    }
  });
});
