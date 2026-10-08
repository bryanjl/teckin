import type { GameReport } from '@teckin/db';
import type { ReportColumn } from '@teckin/game-contracts';
import { toCsv } from '@teckin/questions';

/** The two CSV files a report exports. */
export const reportExportParts = ['players', 'questions'] as const;

/** One of {@link reportExportParts}. */
export type ReportExportPart = (typeof reportExportParts)[number];

/** An accuracy as a whole percentage, or blank with no answers (spreadsheets sort blanks last). */
function percent(accuracy: number | null): number | string {
  return accuracy === null ? '' : Math.round(accuracy * 100);
}

/** A game-specific figure for display, with its unit ("120 m"), or a dash when missing. */
export function formatReportStat(value: number | string | undefined, column: ReportColumn): string {
  if (value === undefined || value === '') return '–';
  return typeof value === 'number' && column.unit ? `${value} ${column.unit}` : String(value);
}

/**
 * The players CSV: one row per player in ranking order, with their answers, accuracy, average
 * answer time and the game's own figures. Cells pass the formula guard (nicknames are typed by
 * players).
 */
export function reportPlayersCsv(report: GameReport, columns: readonly ReportColumn[]): string {
  const header = [
    'Rank',
    'Nickname',
    'Questions answered',
    'Correct answers',
    'Accuracy (%)',
    'Average answer time (s)',
    ...columns.map((column) => (column.unit ? `${column.label} (${column.unit})` : column.label)),
    'Removed by host',
  ];
  const rows = report.players.map((player) => [
    player.rank ?? '',
    player.nickname,
    player.questionsAnswered,
    player.correctAnswers,
    percent(player.accuracy),
    player.averageMillisecondsTaken === null
      ? ''
      : Math.round(player.averageMillisecondsTaken / 100) / 10,
    ...columns.map((column) => player.gameStats[column.key] ?? ''),
    player.removed ? 'Yes' : '',
  ]);
  return toCsv([header, ...rows]);
}

/**
 * The questions CSV: hardest first, with how often each was answered and answered correctly,
 * the correct answer and how many chose each answer.
 */
export function reportQuestionsCsv(report: GameReport): string {
  const mostOptions = Math.max(2, ...report.questions.map((question) => question.options.length));
  const header = [
    'Question number',
    'Question',
    'Times answered',
    'Correct answers',
    'Accuracy (%)',
    'Correct answer',
    ...Array.from({ length: mostOptions }, (_, index) => [
      `Answer ${index + 1}`,
      `Answer ${index + 1} chosen`,
    ]).flat(),
  ];
  const rows = report.questions.map((question) => [
    question.number,
    question.prompt,
    question.timesAnswered,
    question.correctAnswers,
    percent(question.accuracy),
    question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.text)
      .join(' / '),
    ...Array.from({ length: mostOptions }, (_, index) => {
      const option = question.options[index];
      return option ? [option.text, option.timesChosen] : ['', ''];
    }).flat(),
  ]);
  return toCsv([header, ...rows]);
}

/** A download file name such as `cogspire-2026-10-09-players.csv`. */
export function reportFileName(gameName: string, playedAt: Date, part: ReportExportPart): string {
  const slug =
    gameName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'game';
  return `${slug}-${playedAt.toISOString().slice(0, 10)}-${part}.csv`;
}
