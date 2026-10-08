'use client';

import { questionAuthoringLimits, type QuestionProblem } from '@teckin/questions';
import { useState } from 'react';
import {
  addOption,
  changeQuestionType,
  markCorrect,
  removeOption,
  type DraftQuestion,
} from './editor-model';
import { buttonClass, dangerButtonClass, iconButtonClass, inputClass } from './editor-styles';

/** Commands a card sends to the editor that holds the list. */
export interface QuestionCardCommands {
  change: (question: DraftQuestion) => void;
  move: (offset: number) => void;
  duplicate: () => void;
  remove: () => void;
  open: () => void;
  close: () => void;
}

const typeLabels = { multipleChoice: 'Multiple choice', trueFalse: 'True or false' } as const;

function problemFor(problems: readonly QuestionProblem[], field: string): string | null {
  return problems.find((problem) => problem.field === field)?.message ?? null;
}

/**
 * One question: a short summary when closed, the full form when open. Moving, copying and
 * deleting live in the open card so a scroll on a phone never hits them by accident.
 */
export function QuestionCard({
  question,
  number,
  total,
  isOpen,
  problems,
  showProblems,
  commands,
}: {
  question: DraftQuestion;
  number: number;
  total: number;
  isOpen: boolean;
  problems: readonly QuestionProblem[];
  /** Problems show after the host leaves a question or tries to save, not while typing. */
  showProblems: boolean;
  commands: QuestionCardCommands;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const idPrefix = `question-${question.key}`;
  const correct = question.options.find((option) => option.isCorrect);
  const hasProblems = problems.length > 0;

  if (!isOpen) {
    return (
      <li data-testid="question-card" data-question-number={number} data-open="false">
        <button
          type="button"
          onClick={commands.open}
          aria-label={`Edit question ${number}`}
          className="flex min-h-touch w-full items-start gap-3 rounded-2xl bg-surface-raised px-4 py-3 text-left focus-visible:outline-3 focus-visible:outline-accent"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface font-bold">
            {number}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={`break-words text-lg ${question.prompt.trim() ? '' : 'italic text-ink-muted'}`}
              data-testid="question-summary-prompt"
            >
              {question.prompt.trim() || 'Empty question'}
            </span>
            <span className="text-sm text-ink-muted">
              {typeLabels[question.type]}
              {correct?.text.trim() ? ` · Answer: ${correct.text.trim()}` : ''}
            </span>
            {hasProblems && showProblems ? (
              <span className="text-sm font-semibold text-danger" data-testid="question-needs-work">
                {problems[0]!.message}
                {problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  }

  const promptProblem = showProblems ? problemFor(problems, 'prompt') : null;
  const correctProblem = showProblems ? problemFor(problems, 'correct') : null;
  const optionsProblem = showProblems ? problemFor(problems, 'options') : null;
  const canAddOption =
    question.type === 'multipleChoice' &&
    question.options.length < questionAuthoringLimits.maximumMultipleChoiceOptions;
  const canRemoveOption =
    question.options.length > questionAuthoringLimits.minimumMultipleChoiceOptions;

  return (
    <li
      data-testid="question-card"
      data-question-number={number}
      data-open="true"
      className="flex flex-col gap-4 rounded-3xl border-2 border-accent bg-surface-raised p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Question {number}</h3>
        <button type="button" onClick={commands.close} className={buttonClass}>
          Done
        </button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Question type</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['multipleChoice', 'trueFalse'] as const).map((type) => (
            <label
              key={type}
              className={`flex min-h-touch cursor-pointer items-center justify-center rounded-2xl border-2 px-3 text-center font-semibold has-focus-visible:outline-3 has-focus-visible:outline-accent ${
                question.type === type
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-ink-muted/40 bg-surface'
              }`}
            >
              <input
                type="radio"
                name={`${idPrefix}-type`}
                value={type}
                checked={question.type === type}
                onChange={() => commands.change(changeQuestionType(question, type))}
                className="sr-only"
              />
              {typeLabels[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${idPrefix}-prompt`} className="font-semibold">
          Question
        </label>
        <textarea
          id={`${idPrefix}-prompt`}
          data-testid="question-prompt"
          value={question.prompt}
          rows={2}
          maxLength={questionAuthoringLimits.promptLength}
          aria-invalid={promptProblem ? true : undefined}
          aria-describedby={promptProblem ? `${idPrefix}-prompt-problem` : undefined}
          onChange={(event) => commands.change({ ...question, prompt: event.target.value })}
          className={`${inputClass} py-3`}
        />
        {promptProblem ? (
          <p id={`${idPrefix}-prompt-problem`} className="text-danger">
            {promptProblem}
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">
          {question.type === 'trueFalse' ? 'Which is correct?' : 'Answers (pick the correct one)'}
        </legend>
        {question.type === 'trueFalse' ? (
          <div className="grid grid-cols-2 gap-2">
            {question.options.map((option, index) => (
              <label
                key={option.text}
                className={`flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 text-lg font-semibold has-focus-visible:outline-3 has-focus-visible:outline-accent ${
                  option.isCorrect
                    ? 'border-success bg-success/20'
                    : 'border-ink-muted/40 bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-correct`}
                  checked={option.isCorrect}
                  onChange={() => commands.change(markCorrect(question, index))}
                  className="size-5 accent-success"
                />
                {option.text}
              </label>
            ))}
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {question.options.map((option, index) => {
              const optionProblem = showProblems ? problemFor(problems, `option-${index}`) : null;
              return (
                <li key={index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <label
                      className={`flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 has-focus-visible:outline-3 has-focus-visible:outline-accent ${
                        option.isCorrect ? 'border-success bg-success/20' : 'border-ink-muted/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${idPrefix}-correct`}
                        checked={option.isCorrect}
                        onChange={() => commands.change(markCorrect(question, index))}
                        aria-label={`Answer ${index + 1} is correct`}
                        className="size-6 accent-success"
                      />
                    </label>
                    <label htmlFor={`${idPrefix}-option-${index}`} className="sr-only">
                      Answer {index + 1}
                    </label>
                    <input
                      id={`${idPrefix}-option-${index}`}
                      data-testid="question-option"
                      value={option.text}
                      placeholder={`Answer ${index + 1}`}
                      maxLength={questionAuthoringLimits.optionLength}
                      aria-invalid={optionProblem ? true : undefined}
                      onChange={(event) =>
                        commands.change({
                          ...question,
                          options: question.options.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, text: event.target.value }
                              : candidate,
                          ),
                        })
                      }
                      className={`${inputClass} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      aria-label={`Remove answer ${index + 1}`}
                      disabled={!canRemoveOption}
                      onClick={() => commands.change(removeOption(question, index))}
                      className={iconButtonClass}
                    >
                      ✕
                    </button>
                  </div>
                  {optionProblem ? <p className="pl-16 text-danger">{optionProblem}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
        {canAddOption ? (
          <button
            type="button"
            onClick={() => commands.change(addOption(question))}
            className={`${buttonClass} self-start`}
          >
            Add an answer
          </button>
        ) : null}
        {optionsProblem ? <p className="text-danger">{optionsProblem}</p> : null}
        {correctProblem ? (
          <p className="text-danger" data-testid="question-correct-problem">
            {correctProblem}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2 border-t border-ink-muted/20 pt-4">
        <button
          type="button"
          aria-label={`Move question ${number} up`}
          disabled={number === 1}
          onClick={() => commands.move(-1)}
          className={iconButtonClass}
        >
          ↑ Up
        </button>
        <button
          type="button"
          aria-label={`Move question ${number} down`}
          disabled={number === total}
          onClick={() => commands.move(1)}
          className={iconButtonClass}
        >
          ↓ Down
        </button>
        <button type="button" onClick={commands.duplicate} className={iconButtonClass}>
          Duplicate
        </button>
        {confirmDelete ? (
          <>
            <button type="button" onClick={commands.remove} className={dangerButtonClass}>
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className={iconButtonClass}
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete question ${number}`}
            className={`${iconButtonClass} text-danger`}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
