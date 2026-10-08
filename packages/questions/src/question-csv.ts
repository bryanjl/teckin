import {
  findQuestionProblems,
  questionAuthoringLimits,
  trueFalseOptions,
  type AuthoredQuestion,
} from './authoring';
import { parseCsv, toCsv, unguardCsvCell } from './csv';
import type { QuestionType } from './question';

/** The columns of a question CSV, as the template and exports write them. */
export const questionCsvHeaders = [
  'Question',
  'Type',
  'Correct answer',
  'Answer 1',
  'Answer 2',
  'Answer 3',
  'Answer 4',
] as const;

/** Largest CSV file the importer accepts, in bytes; 500 long questions fit comfortably. */
export const maximumQuestionCsvBytes = 1_000_000;

/** One row that could not be imported, numbered as a spreadsheet numbers it (the header is 1). */
export interface CsvRowProblem {
  row: number;
  /** The row's question text, if it had one, so the host can find it. */
  prompt: string;
  messages: string[];
}

/** What came out of a question CSV. */
export interface QuestionCsvImport {
  /** Questions from the rows that worked, in file order. */
  questions: AuthoredQuestion[];
  /** Rows that did not work and why. */
  rowProblems: CsvRowProblem[];
  /** A problem with the whole file (no header, missing columns, too many rows), or null. */
  fileProblem: string | null;
}

/** Lower-case letters and digits only, so "Correct answer", "correct_answer" and "CORRECT ANSWER" match. */
function normaliseHeader(header: string): string {
  return header.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

const questionHeaders = new Set(['question', 'prompt', 'questiontext']);
const typeHeaders = new Set(['type', 'questiontype']);
const correctHeaders = new Set(['correctanswer', 'correct', 'answer', 'rightanswer']);
const optionHeaderPattern = /^(?:answer|option|choice)(\d+)$/;

interface ColumnLayout {
  question: number;
  type: number | null;
  correct: number;
  /** Column index of each answer column, ordered by its number (Answer 1, Answer 2, ...). */
  options: { column: number }[];
}

function readHeader(headerRow: string[]): ColumnLayout | string {
  let question: number | null = null;
  let type: number | null = null;
  let correct: number | null = null;
  const options: { column: number; number: number }[] = [];
  for (const [column, rawHeader] of headerRow.entries()) {
    const header = normaliseHeader(rawHeader);
    const optionMatch = optionHeaderPattern.exec(header);
    if (questionHeaders.has(header) && question === null) question = column;
    else if (typeHeaders.has(header) && type === null) type = column;
    else if (correctHeaders.has(header) && correct === null) correct = column;
    else if (optionMatch) {
      options.push({ column, number: Number(optionMatch[1]) });
    }
  }
  if (question === null || correct === null) {
    const missing = [
      question === null ? '"Question"' : null,
      correct === null ? '"Correct answer"' : null,
    ]
      .filter(Boolean)
      .join(' and ');
    return `The first row must name the columns. Missing: ${missing}. Download the template to see the layout.`;
  }
  options.sort((left, right) => left.number - right.number);
  return {
    question,
    type,
    correct,
    options: options.map(({ column }) => ({ column })),
  };
}

function readType(raw: string): QuestionType | null | 'unknown' {
  const value = normaliseHeader(raw);
  if (value === '') return null;
  if (['multiplechoice', 'multiple', 'mc', 'choice', 'quiz'].includes(value))
    return 'multipleChoice';
  if (['truefalse', 'trueorfalse', 'tf', 'yesno'].includes(value)) return 'trueFalse';
  return 'unknown';
}

/** "True"/"False" (and t/f, yes/no) as a boolean, or null when it is neither. */
function readTrueFalse(raw: string): boolean | null {
  const value = raw.trim().toLocaleLowerCase();
  if (['true', 't', 'yes', 'y'].includes(value)) return true;
  if (['false', 'f', 'no', 'n'].includes(value)) return false;
  return null;
}

function readRow(cells: string[], layout: ColumnLayout): AuthoredQuestion | string[] {
  const cell = (column: number | null) =>
    column === null ? '' : unguardCsvCell((cells[column] ?? '').trim());
  const prompt = cell(layout.question);
  const correct = cell(layout.correct);
  const filledOptions = layout.options
    .map((option) => ({ column: option.column, text: cell(option.column) }))
    .filter((option) => option.text.length > 0);

  const declaredType = readType(cell(layout.type));
  if (declaredType === 'unknown') {
    return [
      `The type "${cell(layout.type)}" is not one we know. Use "multiple choice" or "true false".`,
    ];
  }
  const type: QuestionType =
    declaredType ??
    (filledOptions.length === 0 && readTrueFalse(correct) !== null
      ? 'trueFalse'
      : 'multipleChoice');

  let question: AuthoredQuestion;
  const messages: string[] = [];
  if (type === 'trueFalse') {
    const correctIsTrue = readTrueFalse(correct);
    if (correctIsTrue === null) {
      messages.push(
        correct === ''
          ? 'The correct answer is empty. Write True or False.'
          : `The correct answer "${correct}" must be True or False.`,
      );
    }
    question = { type, prompt, options: trueFalseOptions(correctIsTrue ?? true) };
  } else {
    if (filledOptions.length === 0) {
      messages.push('There are no answers. Fill in the answer columns.');
    }
    // An answer's own text wins over its number, so "4" in a maths set means the answer "4".
    const lowerCorrect = correct.toLocaleLowerCase();
    let correctIndex = filledOptions.findIndex(
      (option) => option.text.toLocaleLowerCase() === lowerCorrect,
    );
    if (correctIndex === -1 && /^\d+$/.test(correct)) {
      const byNumber = layout.options[Number(correct) - 1];
      correctIndex = byNumber
        ? filledOptions.findIndex((option) => option.column === byNumber.column)
        : -1;
    }
    if (correct === '') {
      messages.push('The correct answer is empty.');
    } else if (correctIndex === -1 && filledOptions.length > 0) {
      messages.push(`The correct answer "${correct}" is not one of the answers.`);
    }
    question = {
      type,
      prompt,
      options: filledOptions.map((option, index) => ({
        text: option.text,
        isCorrect: index === correctIndex,
      })),
    };
  }

  // The answers' own checks; skip the "mark the correct answer" one when we already said why.
  for (const problem of findQuestionProblems(question)) {
    if (problem.field === 'correct' && messages.length > 0) continue;
    if (problem.field === 'options' && filledOptions.length === 0 && type === 'multipleChoice')
      continue;
    messages.push(problem.message);
  }
  return messages.length > 0 ? messages : question;
}

/**
 * Reads a question CSV (the layout of {@link questionCsvTemplate}). Rows that work become
 * questions; rows that do not are listed with every reason, so a host can fix them all at once.
 * Blank rows are skipped.
 */
export function importQuestionsFromCsv(text: string): QuestionCsvImport {
  const empty = (fileProblem: string): QuestionCsvImport => ({
    questions: [],
    rowProblems: [],
    fileProblem,
  });
  if (text.length > maximumQuestionCsvBytes) {
    return empty('The file is too big. Split it into files under 1 MB.');
  }
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.trim() !== ''));
  if (headerIndex === -1) return empty('The file is empty.');
  const layout = readHeader(rows[headerIndex]!);
  if (typeof layout === 'string') return empty(layout);

  const dataRows = rows
    .map((cells, index) => ({ cells, row: index + 1 }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ''));
  if (dataRows.length === 0) return empty('The file has a header row but no questions under it.');
  const limit = questionAuthoringLimits.maximumQuestionsPerSet;
  if (dataRows.length > limit) {
    return empty(`The file has ${dataRows.length} questions; a set can hold at most ${limit}.`);
  }

  const questions: AuthoredQuestion[] = [];
  const rowProblems: CsvRowProblem[] = [];
  for (const { cells, row } of dataRows) {
    const result = readRow(cells, layout);
    if (Array.isArray(result)) {
      rowProblems.push({
        row,
        prompt: unguardCsvCell((cells[layout.question] ?? '').trim()),
        messages: result,
      });
    } else {
      questions.push(result);
    }
  }
  return { questions, rowProblems, fileProblem: null };
}

/** Questions as CSV in the template's layout; the importer reads it back unchanged. */
export function questionsToCsv(questions: readonly AuthoredQuestion[]): string {
  const answerColumns = questionCsvHeaders.length - 3;
  return toCsv([
    questionCsvHeaders,
    ...questions.map((question) => {
      const correct = question.options.find((option) => option.isCorrect)?.text ?? '';
      const isTrueFalse = question.type === 'trueFalse';
      const answers = isTrueFalse ? [] : question.options.map((option) => option.text);
      return [
        question.prompt,
        isTrueFalse ? 'true false' : 'multiple choice',
        correct,
        ...Array.from({ length: answerColumns }, (_, index) => answers[index] ?? ''),
      ];
    }),
  ]);
}

/** Example questions in the downloadable template, one of each kind a host might write. */
export const questionCsvExamples: readonly AuthoredQuestion[] = [
  {
    type: 'multipleChoice',
    prompt: 'How many legs does a spider have?',
    options: [
      { text: '6', isCorrect: false },
      { text: '8', isCorrect: true },
      { text: '10', isCorrect: false },
      { text: '12', isCorrect: false },
    ],
  },
  {
    type: 'multipleChoice',
    prompt: 'Which word is a verb?',
    options: [
      { text: 'jump', isCorrect: true },
      { text: 'blue', isCorrect: false },
      { text: 'table', isCorrect: false },
    ],
  },
  {
    type: 'multipleChoice',
    prompt: 'What is 7 + 5?',
    options: [
      { text: '12', isCorrect: true },
      { text: '13', isCorrect: false },
    ],
  },
  { type: 'trueFalse', prompt: 'The Sun is a star.', options: trueFalseOptions(true) },
  { type: 'trueFalse', prompt: 'Water freezes at 10 °C.', options: trueFalseOptions(false) },
];

/** The downloadable CSV template: the header row and a few example questions to copy. */
export function questionCsvTemplate(): string {
  return questionsToCsv(questionCsvExamples);
}
