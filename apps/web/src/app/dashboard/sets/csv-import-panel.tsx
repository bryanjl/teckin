'use client';

import {
  importQuestionsFromCsv,
  maximumQuestionCsvBytes,
  type AuthoredQuestion,
  type QuestionCsvImport,
} from '@teckin/questions';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { csvTemplatePath } from './csv-template-path';
import { buttonClass, primaryButtonClass } from './editor-styles';

/**
 * Reads a question CSV in the browser and shows what will be added, with every row that did not
 * work and why. Nothing is saved here: the questions join the editor's draft, and the server
 * checks them again when the set is saved.
 */
export function CsvImportPanel({
  onImport,
  onClose,
  roomLeft,
}: {
  onImport: (questions: AuthoredQuestion[]) => void;
  onClose: () => void;
  /** How many more questions the set can take. */
  roomLeft: number;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<QuestionCsvImport | null>(null);

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (file.size > maximumQuestionCsvBytes) {
      setResult({
        questions: [],
        rowProblems: [],
        fileProblem: 'The file is too big. Split it into files under 1 MB.',
      });
      return;
    }
    setResult(importQuestionsFromCsv(await file.text()));
  };

  const reset = () => {
    setResult(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const goodCount = result?.questions.length ?? 0;
  const tooMany = goodCount > roomLeft;

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      data-testid="csv-import"
      className="flex flex-col gap-4 rounded-3xl border-2 border-ink-muted/30 bg-surface-raised p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${inputId}-heading`} className="text-xl font-bold">
          Import from CSV
        </h2>
        <button type="button" onClick={onClose} className={buttonClass}>
          Close
        </button>
      </div>
      <p className="text-ink-muted">
        One question per row. Columns: Question, Type (multiple choice or true false), Correct
        answer, then Answer 1 to Answer 4. Save from Excel, Google Sheets or Numbers as CSV.
      </p>
      <a
        href={csvTemplatePath}
        download="teckin-question-template.csv"
        data-testid="csv-template-link"
        className={`${buttonClass} inline-flex items-center justify-center self-start`}
      >
        Download the template
      </a>

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-lg font-semibold">
          CSV file
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={readFile}
          data-testid="csv-file-input"
          className="min-h-touch rounded-2xl border-2 border-dashed border-ink-muted/40 p-3 text-base file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-accent file:px-4 file:font-semibold file:text-accent-ink"
        />
      </div>

      {result ? (
        <div className="flex flex-col gap-3" aria-live="polite" data-testid="csv-import-result">
          {result.fileProblem ? (
            <p role="alert" className="text-lg text-danger" data-testid="csv-file-problem">
              {fileName ? `${fileName}: ` : ''}
              {result.fileProblem}
            </p>
          ) : (
            <p className="text-lg" data-testid="csv-import-summary">
              {goodCount === 1 ? '1 question is' : `${goodCount} questions are`} ready to add.
              {result.rowProblems.length > 0
                ? ` ${result.rowProblems.length === 1 ? '1 row' : `${result.rowProblems.length} rows`} could not be read.`
                : ''}
            </p>
          )}

          {result.rowProblems.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-danger">Rows to fix</h3>
              <ul
                className="flex max-h-80 flex-col gap-2 overflow-y-auto"
                data-testid="csv-row-problems"
              >
                {result.rowProblems.map((problem) => (
                  <li
                    key={problem.row}
                    data-testid="csv-row-problem"
                    data-row={problem.row}
                    className="rounded-2xl border-l-4 border-danger bg-surface px-3 py-2"
                  >
                    <p className="font-semibold">
                      Row {problem.row}
                      {problem.prompt ? (
                        <span className="font-normal text-ink-muted"> · {problem.prompt}</span>
                      ) : null}
                    </p>
                    <ul className="list-disc pl-5">
                      {problem.messages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <p className="text-ink-muted">
                Fix these rows in your spreadsheet and choose the file again, or add the rows that
                worked now.
              </p>
            </div>
          ) : null}

          {tooMany ? (
            <p role="alert" className="text-danger">
              This set has room for {roomLeft} more questions. Split the file or start a new set.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {goodCount > 0 && !tooMany ? (
              <button
                type="button"
                data-testid="csv-import-add"
                className={primaryButtonClass}
                onClick={() => {
                  onImport(result.questions);
                  reset();
                }}
              >
                {result.rowProblems.length > 0
                  ? `Add the ${goodCount} that worked`
                  : `Add ${goodCount === 1 ? '1 question' : `${goodCount} questions`}`}
              </button>
            ) : null}
            <button type="button" className={buttonClass} onClick={() => inputRef.current?.click()}>
              Choose another file
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
