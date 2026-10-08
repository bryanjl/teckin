import { describe, expect, it } from 'vitest';
import { findQuestionProblems, trueFalseOptions, type AuthoredQuestion } from './authoring';
import { csvCell, parseCsv, toCsv } from './csv';
import {
  importQuestionsFromCsv,
  questionCsvExamples,
  questionCsvTemplate,
  questionsToCsv,
} from './question-csv';

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, separators and line breaks inside cells', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,y,z,w\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['x', 'y', 'z', 'w'],
    ]);
  });

  it('skips a byte order mark and detects semicolon and tab separators', () => {
    expect(parseCsv('﻿Question;Correct answer\nHi;1,5\n')).toEqual([
      ['Question', 'Correct answer'],
      ['Hi', '1,5'],
    ]);
    expect(parseCsv('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps blank lines as rows so numbering matches a spreadsheet', () => {
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], [''], ['b']]);
  });
});

describe('csv writing', () => {
  it('quotes when needed and guards formulas without spoiling negative numbers', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('-3')).toBe('-3');
    expect(csvCell(null)).toBe('');
    expect(toCsv([['a', 1, true]])).toBe('a,1,true\r\n');
  });
});

/** A CSV of `count` valid questions alternating multiple choice and true/false. */
function validCsv(count: number): string {
  const lines = ['Question,Type,Correct answer,Answer 1,Answer 2,Answer 3,Answer 4'];
  for (let index = 1; index <= count; index += 1) {
    lines.push(
      index % 2 === 0
        ? `"Is ${index} even?",true false,True,,,,`
        : `"What is ${index} + 1?",multiple choice,${index + 1},${index},${index + 1},${index + 2},${index + 3}`,
    );
  }
  return lines.join('\r\n');
}

describe('importQuestionsFromCsv', () => {
  it('imports a 50-question CSV', () => {
    const result = importQuestionsFromCsv(validCsv(50));
    expect(result.fileProblem).toBeNull();
    expect(result.rowProblems).toEqual([]);
    expect(result.questions).toHaveLength(50);
    expect(result.questions[0]).toEqual({
      type: 'multipleChoice',
      prompt: 'What is 1 + 1?',
      options: [
        { text: '1', isCorrect: false },
        { text: '2', isCorrect: true },
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: false },
      ],
    });
    expect(result.questions[1]).toEqual({
      type: 'trueFalse',
      prompt: 'Is 2 even?',
      options: trueFalseOptions(true),
    });
    for (const question of result.questions) expect(findQuestionProblems(question)).toEqual([]);
  });

  it('reports which rows failed and why, and keeps the rows that worked', () => {
    const csv = [
      'Question,Type,Correct answer,Answer 1,Answer 2,Answer 3,Answer 4',
      'Good one,multiple choice,b,a,b,,',
      ',multiple choice,a,a,b,,',
      'Wrong answer,multiple choice,z,a,b,,',
      'No answers,multiple choice,a,,,,',
      'Bad type,essay,a,a,b,,',
      'Bad truth,true false,maybe,,,,',
      '',
      'Twins,mc,a,a,A,,',
      'Two problems,,,a,,,',
      'Also good,tf,false,,,,',
    ].join('\n');
    const result = importQuestionsFromCsv(csv);
    expect(result.fileProblem).toBeNull();
    expect(result.questions.map((question) => question.prompt)).toEqual(['Good one', 'Also good']);
    expect(result.rowProblems).toEqual([
      { row: 3, prompt: '', messages: ['The question is empty.'] },
      {
        row: 4,
        prompt: 'Wrong answer',
        messages: ['The correct answer "z" is not one of the answers.'],
      },
      {
        row: 5,
        prompt: 'No answers',
        messages: ['There are no answers. Fill in the answer columns.'],
      },
      {
        row: 6,
        prompt: 'Bad type',
        messages: ['The type "essay" is not one we know. Use "multiple choice" or "true false".'],
      },
      {
        row: 7,
        prompt: 'Bad truth',
        messages: ['The correct answer "maybe" must be True or False.'],
      },
      { row: 9, prompt: 'Twins', messages: ['Answers 1 and 2 are the same.'] },
      {
        row: 10,
        prompt: 'Two problems',
        messages: ['The correct answer is empty.', 'Add at least 2 answers.'],
      },
    ]);
  });

  it('matches the correct answer by text first, then by answer number', () => {
    const csv = [
      'question,correct,answer 1,answer 2,answer 3',
      'Maths,4,2,4,6',
      'By number,3,red,green,blue',
      'Ignores case,GREEN,red,green,blue',
    ].join('\n');
    const result = importQuestionsFromCsv(csv);
    expect(result.rowProblems).toEqual([]);
    const correctTexts = result.questions.map(
      (question) => question.options.find((option) => option.isCorrect)?.text,
    );
    expect(correctTexts).toEqual(['4', 'blue', 'green']);
  });

  it('infers true/false when the type is blank and there are no answers', () => {
    const result = importQuestionsFromCsv('Question,Correct answer\nThe sky is green.,false\n');
    expect(result.questions).toEqual([
      { type: 'trueFalse', prompt: 'The sky is green.', options: trueFalseOptions(false) },
    ]);
  });

  it('explains problems with the whole file', () => {
    expect(importQuestionsFromCsv('').fileProblem).toBe('The file is empty.');
    expect(importQuestionsFromCsv('Prompt,Answer 1\nHi,there').fileProblem).toMatch(
      /Missing: "Correct answer"/,
    );
    expect(importQuestionsFromCsv('Name,Age\nSam,8').fileProblem).toMatch(
      /Missing: "Question" and "Correct answer"/,
    );
    expect(importQuestionsFromCsv('Question,Correct answer\n\n').fileProblem).toMatch(
      /no questions/,
    );
    expect(importQuestionsFromCsv(validCsv(501)).fileProblem).toMatch(/501 questions.*at most 500/);
    expect(importQuestionsFromCsv('x'.repeat(1_000_001)).fileProblem).toMatch(/too big/);
  });
});

describe('the template and export', () => {
  it('the template imports as its example questions, all valid', () => {
    const template = questionCsvTemplate();
    expect(template.split('\r\n')[0]).toBe(
      'Question,Type,Correct answer,Answer 1,Answer 2,Answer 3,Answer 4',
    );
    const result = importQuestionsFromCsv(template);
    expect(result.rowProblems).toEqual([]);
    expect(result.questions).toEqual(questionCsvExamples);
  });

  it('exports questions that import back unchanged, including awkward text', () => {
    const questions: AuthoredQuestion[] = [
      {
        type: 'multipleChoice',
        prompt: 'Which is "quoted", with a comma;\nand a new line?',
        options: [
          { text: '=1+1', isCorrect: true },
          { text: '-3', isCorrect: false },
          { text: '@home', isCorrect: false },
        ],
      },
      { type: 'trueFalse', prompt: 'Ice is cold.', options: trueFalseOptions(true) },
    ];
    expect(importQuestionsFromCsv(questionsToCsv(questions)).questions).toEqual(questions);
  });
});
