import { describe, expect, it } from 'vitest';
import {
  addOption,
  blankQuestion,
  changeQuestionType,
  copyTitle,
  duplicateQuestion,
  markCorrect,
  moveQuestion,
  problemsByQuestion,
  removeOption,
  toAuthoredQuestionSet,
  toDraftQuestions,
  type DraftQuestion,
} from './editor-model';

const question = (prompt: string): DraftQuestion => ({
  ...blankQuestion('multipleChoice'),
  prompt,
  options: [
    { text: 'Yes', isCorrect: true },
    { text: 'No', isCorrect: false },
  ],
});

describe('question editor model', () => {
  it('starts questions blank and reports what is missing', () => {
    const blank = blankQuestion('multipleChoice');
    expect(blank.options).toEqual([
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ]);
    const problems = problemsByQuestion([blank, question('Fine?')]);
    expect([...problems.keys()]).toEqual([blank.key]);
    expect(problems.get(blank.key)?.map((problem) => problem.field)).toEqual([
      'prompt',
      'option-0',
      'option-1',
      'correct',
    ]);
    expect(blankQuestion('trueFalse').options.map((option) => option.text)).toEqual([
      'True',
      'False',
    ]);
  });

  it('marks exactly one answer correct', () => {
    const marked = markCorrect(addOption(question('Q')), 2);
    expect(marked.options.map((option) => option.isCorrect)).toEqual([false, false, true]);
  });

  it('adds answers up to 4 and removes them down to 2', () => {
    let current = question('Q');
    for (let step = 0; step < 5; step += 1) current = addOption(current);
    expect(current.options).toHaveLength(4);
    for (let step = 0; step < 5; step += 1) current = removeOption(current, 0);
    expect(current.options).toHaveLength(2);
  });

  it('switches type keeping the prompt and a sensible correct answer', () => {
    const asTrueFalse = changeQuestionType(
      {
        ...question('Is it?'),
        options: [
          { text: 'False', isCorrect: true },
          { text: 'x', isCorrect: false },
        ],
      },
      'trueFalse',
    );
    expect(asTrueFalse).toMatchObject({ type: 'trueFalse', prompt: 'Is it?' });
    expect(asTrueFalse.options).toEqual([
      { text: 'True', isCorrect: false },
      { text: 'False', isCorrect: true },
    ]);
    const back = changeQuestionType(asTrueFalse, 'multipleChoice');
    expect(back.type).toBe('multipleChoice');
    expect(back.options).toEqual(asTrueFalse.options);
  });

  it('moves, duplicates and keeps keys unique', () => {
    const list = [question('a'), question('b'), question('c')];
    expect(moveQuestion(list, 2, -1).map((item) => item.prompt)).toEqual(['a', 'c', 'b']);
    expect(moveQuestion(list, 0, -1).map((item) => item.prompt)).toEqual(['a', 'b', 'c']);
    expect(moveQuestion(list, 0, 5).map((item) => item.prompt)).toEqual(['b', 'c', 'a']);
    const duplicated = duplicateQuestion(list, 0);
    expect(duplicated.map((item) => item.prompt)).toEqual(['a', 'a', 'b', 'c']);
    expect(new Set(duplicated.map((item) => item.key)).size).toBe(4);
    duplicated[1]!.options[0]!.text = 'changed';
    expect(list[0]!.options[0]!.text).toBe('Yes');
  });

  it('round-trips between saved questions and drafts without the keys', () => {
    const saved = [
      { type: 'multipleChoice' as const, prompt: 'P', options: question('P').options },
    ];
    const set = toAuthoredQuestionSet({
      title: 'T',
      description: '',
      questions: toDraftQuestions(saved),
    });
    expect(set).toEqual({ title: 'T', description: '', questions: saved });
  });

  it('names copies within the title limit', () => {
    expect(copyTitle('Maths')).toBe('Copy of Maths');
    expect(copyTitle('x'.repeat(120))).toHaveLength(120);
  });
});
