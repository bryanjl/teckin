import { buildGameReport } from '@teckin/db';
import { parseCsv } from '@teckin/questions';
import { describe, expect, it } from 'vitest';
import {
  formatReportStat,
  reportFileName,
  reportPlayersCsv,
  reportQuestionsCsv,
} from './report-export';

const report = buildGameReport({
  snapshot: {
    questions: [
      {
        id: 'q1',
        type: 'multipleChoice',
        prompt: 'What is 7 × 8?',
        options: [
          { id: 'a', text: '54', isCorrect: false },
          { id: 'b', text: '56', isCorrect: true },
          { id: 'c', text: '58', isCorrect: false },
        ],
      },
      {
        id: 'q2',
        type: 'trueFalse',
        prompt: '=1+1 is a formula',
        options: [
          { id: 't', text: 'True', isCorrect: true },
          { id: 'f', text: 'False', isCorrect: false },
        ],
      },
    ],
  },
  participants: [
    { id: 'p1', nickname: '=HYPERLINK("x")', removedAt: null },
    { id: 'p2', nickname: 'Calm Heron', removedAt: new Date() },
  ],
  answers: [
    {
      participantId: 'p1',
      questionId: 'q1',
      chosenOptionId: 'b',
      isCorrect: true,
      millisecondsTaken: 2000,
    },
    {
      participantId: 'p1',
      questionId: 'q2',
      chosenOptionId: 'f',
      isCorrect: false,
      millisecondsTaken: 3000,
    },
    {
      participantId: 'p2',
      questionId: 'q1',
      chosenOptionId: 'a',
      isCorrect: false,
      millisecondsTaken: 4000,
    },
  ],
  results: [
    { participantId: 'p1', rank: 1, gameStats: { bestHeightMetres: 120, summitsReached: 2 } },
  ],
});
const columns = [
  { key: 'bestHeightMetres', label: 'Best height', unit: 'm' },
  { key: 'summitsReached', label: 'Summits' },
];

describe('report CSV export', () => {
  it('writes one row per player with the report figures, guarding formulas', () => {
    const rows = parseCsv(reportPlayersCsv(report, columns));
    expect(rows[0]).toEqual([
      'Rank',
      'Nickname',
      'Questions answered',
      'Correct answers',
      'Accuracy (%)',
      'Average answer time (s)',
      'Best height (m)',
      'Summits',
      'Removed by host',
    ]);
    expect(rows[1]).toEqual(['1', `'=HYPERLINK("x")`, '2', '1', '50', '2.5', '120', '2', '']);
    expect(rows[2]).toEqual(['', 'Calm Heron', '1', '0', '0', '4', '', '', 'Yes']);
  });

  it('writes questions hardest first with how often each answer was chosen', () => {
    const rows = parseCsv(reportQuestionsCsv(report));
    expect(rows[0]!.slice(0, 6)).toEqual([
      'Question number',
      'Question',
      'Times answered',
      'Correct answers',
      'Accuracy (%)',
      'Correct answer',
    ]);
    expect(rows[1]).toEqual([
      '2',
      `'=1+1 is a formula`,
      '1',
      '0',
      '0',
      'True',
      'True',
      '0',
      'False',
      '1',
      '',
      '',
    ]);
    expect(rows[2]).toEqual([
      '1',
      'What is 7 × 8?',
      '2',
      '1',
      '50',
      '56',
      '54',
      '1',
      '56',
      '1',
      '58',
      '0',
    ]);
  });

  it('names files and formats figures', () => {
    expect(reportFileName('Cogspire', new Date('2026-10-09T10:00:00Z'), 'players')).toBe(
      'cogspire-2026-10-09-players.csv',
    );
    expect(formatReportStat(120, columns[0]!)).toBe('120 m');
    expect(formatReportStat(undefined, columns[1]!)).toBe('–');
  });
});
