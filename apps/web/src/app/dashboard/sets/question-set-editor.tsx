'use client';

import {
  checkAuthoredQuestionSet,
  questionAuthoringLimits,
  questionSetReadiness,
  type AuthoredQuestion,
  type QuestionType,
} from '@teckin/questions';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  createQuestionSet,
  deleteQuestionSet,
  duplicateQuestionSet,
  saveQuestionSet,
  type SaveQuestionSetResult,
} from './actions';
import { CsvImportPanel } from './csv-import-panel';
import {
  blankQuestion,
  duplicateQuestion,
  moveQuestion,
  problemsByQuestion,
  toAuthoredQuestionSet,
  toDraftQuestions,
  type DraftQuestion,
} from './editor-model';
import { buttonClass, dangerButtonClass, inputClass, primaryButtonClass } from './editor-styles';
import { QuestionCard } from './question-card';

/** The set the editor opens with; a new set has no id. */
export interface QuestionSetEditorProps {
  questionSetId: string | null;
  title: string;
  description: string;
  questions: AuthoredQuestion[];
  /** The set's `updatedAt` as loaded, so a save can tell if another tab saved first. */
  loadedAt: string | null;
  /** Open the CSV import straight away (from the dashboard's "Import from CSV"). */
  startWithImport?: boolean;
  /** Show "this is a copy" once after duplicating. */
  justCopied?: boolean;
}

type SaveStatus =
  { kind: 'idle' } | { kind: 'saved' } | { kind: 'problem'; message: string } | { kind: 'stale' };

/**
 * Creates or edits one question set. Everything happens in a draft in the browser; Save sends
 * the whole set, which the server checks with the same rules before storing it.
 */
export function QuestionSetEditor(props: QuestionSetEditorProps) {
  const [questionSetId, setQuestionSetId] = useState(props.questionSetId);
  const [loadedAt, setLoadedAt] = useState(props.loadedAt);
  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description);
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    toDraftQuestions(props.questions),
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [visitedKeys, setVisitedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [showAllProblems, setShowAllProblems] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [importing, setImporting] = useState(Boolean(props.startWithImport));
  const [notice, setNotice] = useState<string | null>(
    props.justCopied ? 'This is your copy. Change anything you like.' : null,
  );
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [confirmDeleteSet, setConfirmDeleteSet] = useState(false);
  const [saving, startSaving] = useTransition();
  const [titleProblem, setTitleProblem] = useState<string | null>(null);

  const problems = useMemo(() => problemsByQuestion(questions), [questions]);
  const readiness = questionSetReadiness(questions.length);
  const roomLeft = questionAuthoringLimits.maximumQuestionsPerSet - questions.length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edited = () => {
    setDirty(true);
    if (status.kind === 'saved' || status.kind === 'problem') setStatus({ kind: 'idle' });
  };

  const changeQuestions = (update: (current: DraftQuestion[]) => DraftQuestion[]) => {
    setQuestions(update);
    edited();
  };

  const openQuestion = (key: string | null) => {
    if (openKey) setVisitedKeys((visited) => new Set(visited).add(openKey));
    setOpenKey(key);
  };

  const addQuestion = (type: QuestionType) => {
    const question = blankQuestion(type);
    changeQuestions((current) => [...current, question]);
    openQuestion(question.key);
  };

  const addImported = (imported: AuthoredQuestion[]) => {
    changeQuestions((current) => [...current, ...toDraftQuestions(imported)]);
    setImporting(false);
    setNotice(
      `Added ${imported.length === 1 ? '1 question' : `${imported.length} questions`}. Save to keep them.`,
    );
  };

  const handleResult = (result: SaveQuestionSetResult) => {
    if (result.ok) {
      setDirty(false);
      setLoadedAt(result.updatedAt);
      setStatus({ kind: 'saved' });
      if (!questionSetId) {
        setQuestionSetId(result.questionSetId);
        // Updates the address without remounting the editor, so its state carries on.
        window.history.replaceState(null, '', `/dashboard/sets/${result.questionSetId}`);
      }
      return;
    }
    if (result.reason === 'stale') {
      setStatus({ kind: 'stale' });
    } else if (result.reason === 'missing') {
      setStatus({
        kind: 'problem',
        message: 'This set no longer exists. It may have been deleted.',
      });
    } else if (result.reason === 'invalid') {
      setShowAllProblems(true);
      const first = result.problems[0];
      setStatus({ kind: 'problem', message: first?.message ?? 'Some questions need fixing.' });
    }
  };

  const save = () => {
    const content = toAuthoredQuestionSet({ title, description, questions });
    const checked = checkAuthoredQuestionSet(content);
    if (!checked.ok) {
      setShowAllProblems(true);
      const titleIssue = checked.problems.find((problem) => problem.field === 'title');
      setTitleProblem(titleIssue?.message ?? null);
      const questionCount = new Set(
        checked.problems.flatMap((problem) =>
          problem.questionIndex === null ? [] : [problem.questionIndex],
        ),
      ).size;
      const firstQuestion = checked.problems.find((problem) => problem.questionIndex !== null);
      if (firstQuestion?.questionIndex !== undefined && firstQuestion.questionIndex !== null) {
        openQuestion(questions[firstQuestion.questionIndex]?.key ?? null);
      }
      setStatus({
        kind: 'problem',
        message:
          questionCount > 0
            ? `Fix ${questionCount === 1 ? '1 question' : `${questionCount} questions`} before saving.`
            : (titleIssue?.message ?? checked.problems[0]!.message),
      });
      return;
    }
    setTitleProblem(null);
    startSaving(async () => {
      try {
        handleResult(
          questionSetId
            ? await saveQuestionSet(questionSetId, content, loadedAt)
            : await createQuestionSet(content),
        );
      } catch {
        setStatus({
          kind: 'problem',
          message: 'Saving did not work. Check your connection and try again.',
        });
      }
    });
  };

  const statusText = saving
    ? 'Saving…'
    : status.kind === 'saved' && !dirty
      ? 'All changes saved'
      : status.kind === 'problem'
        ? status.message
        : status.kind === 'stale'
          ? 'This set was changed in another tab or device. Reload to see that version (your changes here will be lost) or copy them first.'
          : dirty
            ? 'Unsaved changes'
            : questionSetId
              ? 'No changes'
              : 'New set, not saved yet';

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-40">
      <nav>
        <Link
          href="/dashboard"
          className="inline-flex min-h-touch items-center text-lg font-semibold text-accent underline-offset-4 hover:underline"
        >
          ← Dashboard
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="sr-only">{questionSetId ? 'Edit question set' : 'New question set'}</h1>
        <label htmlFor="set-title" className="font-semibold">
          Title
        </label>
        <input
          id="set-title"
          data-testid="set-title"
          value={title}
          maxLength={questionAuthoringLimits.titleLength}
          placeholder="For example: Times tables to 10"
          aria-invalid={titleProblem ? true : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            edited();
          }}
          className={`${inputClass} text-2xl font-bold`}
        />
        {titleProblem ? <p className="text-danger">{titleProblem}</p> : null}
        <label htmlFor="set-description" className="font-semibold">
          Description <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea
          id="set-description"
          value={description}
          rows={2}
          maxLength={questionAuthoringLimits.descriptionLength}
          onChange={(event) => {
            setDescription(event.target.value);
            edited();
          }}
          className={`${inputClass} py-3`}
        />
      </header>

      <p
        data-testid="set-readiness"
        data-playable={readiness.playable ? 'true' : 'false'}
        className={`rounded-2xl px-4 py-3 text-lg ${
          readiness.playable ? 'bg-success/15 text-ink' : 'bg-accent/15 text-ink'
        }`}
      >
        {readiness.playable
          ? `Ready for a game · ${questions.length} questions`
          : `Add ${readiness.questionsNeeded === 1 ? '1 more question' : `${readiness.questionsNeeded} more questions`} to use this set in a game (it needs ${questionAuthoringLimits.minimumQuestionsToPlay}).`}
      </p>

      {notice ? (
        <p
          role="status"
          data-testid="editor-notice"
          className="rounded-2xl bg-surface-raised px-4 py-3"
        >
          {notice}
        </p>
      ) : null}

      <section aria-labelledby="questions-heading" className="flex flex-col gap-3">
        <h2 id="questions-heading" className="text-xl font-bold">
          Questions <span className="text-ink-muted">({questions.length})</span>
        </h2>
        {questions.length === 0 ? (
          <p className="text-ink-muted">No questions yet. Add one below or import a CSV file.</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="question-list">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.key}
                question={question}
                number={index + 1}
                total={questions.length}
                isOpen={openKey === question.key}
                problems={problems.get(question.key) ?? []}
                showProblems={showAllProblems || visitedKeys.has(question.key)}
                commands={{
                  change: (changed) =>
                    changeQuestions((current) =>
                      current.map((candidate) =>
                        candidate.key === changed.key ? changed : candidate,
                      ),
                    ),
                  move: (offset) =>
                    changeQuestions((current) => moveQuestion(current, index, offset)),
                  duplicate: () => {
                    const next = duplicateQuestion(questions, index);
                    changeQuestions(() => next);
                    openQuestion(next[index + 1]!.key);
                  },
                  remove: () => {
                    changeQuestions((current) =>
                      current.filter((candidate) => candidate.key !== question.key),
                    );
                    setOpenKey(null);
                  },
                  open: () => openQuestion(question.key),
                  close: () => openQuestion(null),
                }}
              />
            ))}
          </ol>
        )}
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <button
            type="button"
            disabled={roomLeft <= 0}
            onClick={() => addQuestion('multipleChoice')}
            className={buttonClass}
          >
            + Multiple choice
          </button>
          <button
            type="button"
            disabled={roomLeft <= 0}
            onClick={() => addQuestion('trueFalse')}
            className={buttonClass}
          >
            + True or false
          </button>
        </div>
        {importing ? (
          <CsvImportPanel
            onImport={addImported}
            onClose={() => setImporting(false)}
            roomLeft={roomLeft}
          />
        ) : (
          <button
            type="button"
            onClick={() => setImporting(true)}
            className={`${buttonClass} self-start`}
          >
            Import from CSV
          </button>
        )}
      </section>

      {questionSetId ? (
        <section
          aria-labelledby="set-actions-heading"
          className="flex flex-col gap-3 border-t border-ink-muted/20 pt-5"
        >
          <h2 id="set-actions-heading" className="text-xl font-bold">
            This set
          </h2>
          <p className="text-ink-muted">
            Copying and deleting use the last saved version. Past games keep their own copy of the
            questions, so their reports never change.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={duplicateQuestionSet.bind(null, questionSetId)}>
              <button type="submit" disabled={dirty} className={buttonClass}>
                Duplicate set
              </button>
            </form>
            {confirmDeleteSet ? (
              <form action={deleteQuestionSet.bind(null, questionSetId)} className="flex gap-2">
                <button type="submit" className={dangerButtonClass} onClick={() => setDirty(false)}>
                  Yes, delete this set
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSet(false)}
                  className={buttonClass}
                >
                  Keep it
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteSet(true)}
                className={dangerButtonClass}
              >
                Delete set
              </button>
            )}
          </div>
          {dirty ? (
            <p className="text-ink-muted">Save first to duplicate your latest changes.</p>
          ) : null}
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-muted/20 bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p
            role="status"
            data-testid="save-status"
            data-status={saving ? 'saving' : status.kind}
            className={`min-w-0 flex-1 text-sm sm:text-base ${
              status.kind === 'problem' || status.kind === 'stale'
                ? 'text-danger'
                : 'text-ink-muted'
            }`}
          >
            {statusText}
          </p>
          {status.kind === 'stale' ? (
            <button
              type="button"
              onClick={() => {
                setDirty(false);
                window.location.reload();
              }}
              className={`${buttonClass} shrink-0`}
            >
              Reload
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving || (!dirty && questionSetId !== null)}
            data-testid="save-set"
            className={`${primaryButtonClass} shrink-0`}
          >
            {questionSetId ? 'Save' : 'Create set'}
          </button>
        </div>
      </div>
    </main>
  );
}
