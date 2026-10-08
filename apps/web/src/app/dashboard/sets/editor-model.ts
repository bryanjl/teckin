import {
  findQuestionProblems,
  questionAuthoringLimits,
  trueFalseOptions,
  trueFalseOptionTexts,
  type AuthoredQuestion,
  type AuthoredQuestionSet,
  type QuestionProblem,
  type QuestionType,
} from '@teckin/questions';

/** A question in the editor: the authored question plus a key that survives reordering. */
export interface DraftQuestion extends AuthoredQuestion {
  key: string;
}

/** Everything the editor holds for one set. */
export interface DraftQuestionSet {
  title: string;
  description: string;
  questions: DraftQuestion[];
}

let nextKey = 0;
/** A key unique within this page; keys never leave the browser. */
export function newDraftKey(): string {
  nextKey += 1;
  return `q${nextKey}`;
}

/** Wraps saved or imported questions for the editor. */
export function toDraftQuestions(questions: readonly AuthoredQuestion[]): DraftQuestion[] {
  return questions.map((question) => ({
    key: newDraftKey(),
    type: question.type,
    prompt: question.prompt,
    options: question.options.map((option) => ({ ...option })),
  }));
}

/** The set as it is saved: the same content without the editor's keys. */
export function toAuthoredQuestionSet(draft: DraftQuestionSet): AuthoredQuestionSet {
  return {
    title: draft.title,
    description: draft.description,
    questions: draft.questions.map(({ type, prompt, options }) => ({
      type,
      prompt,
      options: options.map(({ text, isCorrect }) => ({ text, isCorrect })),
    })),
  };
}

/** A new, empty question of `type`. Multiple choice starts with two blank answers. */
export function blankQuestion(type: QuestionType): DraftQuestion {
  return {
    key: newDraftKey(),
    type,
    prompt: '',
    options:
      type === 'trueFalse'
        ? trueFalseOptions(true)
        : [
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
          ],
  };
}

/**
 * The question as the other type. To true/false keeps the prompt and starts on True; to
 * multiple choice keeps True and False as editable answers with the same one correct.
 */
export function changeQuestionType(question: DraftQuestion, type: QuestionType): DraftQuestion {
  if (question.type === type) return question;
  if (type === 'trueFalse') {
    const correctText = question.options.find((option) => option.isCorrect)?.text.trim();
    return {
      ...question,
      type,
      options: trueFalseOptions(correctText !== trueFalseOptionTexts[1]),
    };
  }
  return { ...question, type, options: question.options.map((option) => ({ ...option })) };
}

/** `question` with answer `optionIndex` as the only correct one. */
export function markCorrect(question: DraftQuestion, optionIndex: number): DraftQuestion {
  return {
    ...question,
    options: question.options.map((option, index) => ({
      ...option,
      isCorrect: index === optionIndex,
    })),
  };
}

/** `question` with a blank answer added, if it has room. */
export function addOption(question: DraftQuestion): DraftQuestion {
  if (question.options.length >= questionAuthoringLimits.maximumMultipleChoiceOptions) {
    return question;
  }
  return { ...question, options: [...question.options, { text: '', isCorrect: false }] };
}

/** `question` without answer `optionIndex`, keeping at least the minimum. */
export function removeOption(question: DraftQuestion, optionIndex: number): DraftQuestion {
  if (question.options.length <= questionAuthoringLimits.minimumMultipleChoiceOptions) {
    return question;
  }
  return { ...question, options: question.options.filter((_, index) => index !== optionIndex) };
}

/** `questions` with the one at `index` moved by `offset` places (clamped to the list). */
export function moveQuestion<Item>(
  questions: readonly Item[],
  index: number,
  offset: number,
): Item[] {
  const target = Math.min(questions.length - 1, Math.max(0, index + offset));
  if (target === index || index < 0 || index >= questions.length) return [...questions];
  const moved = [...questions];
  const [item] = moved.splice(index, 1);
  moved.splice(target, 0, item!);
  return moved;
}

/** `questions` with a copy of the one at `index` placed straight after it. */
export function duplicateQuestion(
  questions: readonly DraftQuestion[],
  index: number,
): DraftQuestion[] {
  const original = questions[index];
  if (!original) return [...questions];
  const copy: DraftQuestion = {
    ...original,
    key: newDraftKey(),
    options: original.options.map((option) => ({ ...option })),
  };
  return [...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)];
}

/** Problems with each question, by key; questions with none are left out. */
export function problemsByQuestion(
  questions: readonly DraftQuestion[],
): Map<string, QuestionProblem[]> {
  const problems = new Map<string, QuestionProblem[]>();
  for (const question of questions) {
    const found = findQuestionProblems(question);
    if (found.length > 0) problems.set(question.key, found);
  }
  return problems;
}

/** A title for a copy of a set, kept within the title limit. */
export function copyTitle(title: string): string {
  return `Copy of ${title}`.slice(0, questionAuthoringLimits.titleLength);
}
