import { describe, expect, it } from 'vitest';
import { parseQuestionSet, presentQuestion } from './question';
import { sampleQuestionSetIds, sampleQuestionSets } from './sample-sets';
import { testQuestion } from './testing';

const set = (questions: unknown[]) => ({ id: 's', title: 'S', questions });

describe('question validation', () => {
  it('accepts multiple choice with 2 to 4 options and one correct', () => {
    expect(parseQuestionSet(set([testQuestion('q1')])).questions).toHaveLength(1);
  });

  it('rejects zero or two correct options', () => {
    const none = {
      ...testQuestion('q1'),
      options: testQuestion('q1').options.map((o) => ({ ...o, isCorrect: false })),
    };
    expect(() => parseQuestionSet(set([none]))).toThrow(/exactly one option/);
    const two = {
      ...testQuestion('q1'),
      options: testQuestion('q1').options.map((o) => ({ ...o, isCorrect: true })),
    };
    expect(() => parseQuestionSet(set([two]))).toThrow(/exactly one option/);
  });

  it('rejects five options, a true/false with three, and duplicate ids', () => {
    const base = testQuestion('q1');
    const five = {
      ...base,
      options: [
        ...base.options,
        { id: 'd', text: 'd', isCorrect: false },
        { id: 'e', text: 'e', isCorrect: false },
      ],
    };
    expect(() => parseQuestionSet(set([five]))).toThrow();
    expect(() => parseQuestionSet(set([{ ...base, type: 'trueFalse' }]))).toThrow(/exactly two/);
    expect(() => parseQuestionSet(set([base, base]))).toThrow(/unique/);
  });

  it('presents a question without revealing the answer', () => {
    const presented = presentQuestion(testQuestion('q1'));
    expect(JSON.stringify(presented)).not.toContain('isCorrect');
    expect(presented.options.map((option) => option.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sample sets', () => {
  it.each(sampleQuestionSetIds)('%s has at least 30 valid questions', (id) => {
    const sample = sampleQuestionSets[id];
    expect(sample.id).toBe(id);
    expect(sample.questions.length).toBeGreaterThanOrEqual(30);
    for (const question of sample.questions) {
      expect(question.id.startsWith(id === 'general-knowledge' ? 'general-' : `${id}-`)).toBe(true);
    }
  });
});
