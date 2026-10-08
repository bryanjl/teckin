import { z } from 'zod';
import { questionTypes, type QuestionType } from './question';

/**
 * Rules for questions a host writes in the editor or imports from CSV. The editor, the CSV
 * importer and the server all check with these, so a set that saves is a set that can be played.
 * Limits match {@link questionSchema}, the shape the game engine runs.
 */
export const questionAuthoringLimits = {
  /** A set needs this many questions before a game can use it. */
  minimumQuestionsToPlay: 5,
  /** Keeps one set (and one import) to a size a phone editor and one save request handle well. */
  maximumQuestionsPerSet: 500,
  minimumMultipleChoiceOptions: 2,
  maximumMultipleChoiceOptions: 4,
  promptLength: 300,
  optionLength: 200,
  titleLength: 120,
  descriptionLength: 500,
} as const;

/** The two answers of every true/false question, in this order. */
export const trueFalseOptionTexts = ['True', 'False'] as const;

/** One answer as a host writes it. */
export interface AuthoredOption {
  text: string;
  isCorrect: boolean;
}

/** One question as a host writes it; its position is its place in the set. */
export interface AuthoredQuestion {
  type: QuestionType;
  prompt: string;
  options: AuthoredOption[];
}

/** A question set as a host writes it. */
export interface AuthoredQuestionSet {
  title: string;
  description: string;
  questions: AuthoredQuestion[];
}

/** Which part of a question a problem is about, so the editor can show it in the right place. */
export type QuestionProblemField = 'prompt' | 'options' | 'correct' | `option-${number}`;

/** Something that stops a question being saved, in words a host can act on. */
export interface QuestionProblem {
  field: QuestionProblemField;
  message: string;
}

/** The answers of a true/false question whose right answer is `correctIsTrue`. */
export function trueFalseOptions(correctIsTrue: boolean): AuthoredOption[] {
  return [
    { text: trueFalseOptionTexts[0], isCorrect: correctIsTrue },
    { text: trueFalseOptionTexts[1], isCorrect: !correctIsTrue },
  ];
}

/**
 * Everything wrong with `question`, or an empty list when it can be saved. Text is compared
 * trimmed, as it will be stored.
 */
export function findQuestionProblems(question: AuthoredQuestion): QuestionProblem[] {
  const limits = questionAuthoringLimits;
  const problems: QuestionProblem[] = [];
  const prompt = question.prompt.trim();
  if (prompt.length === 0) {
    problems.push({ field: 'prompt', message: 'The question is empty.' });
  } else if (prompt.length > limits.promptLength) {
    problems.push({
      field: 'prompt',
      message: `The question is too long (${prompt.length} characters; the limit is ${limits.promptLength}).`,
    });
  }

  const texts = question.options.map((option) => option.text.trim());
  if (question.type === 'trueFalse') {
    const isTrueFalse =
      texts.length === 2 &&
      texts[0] === trueFalseOptionTexts[0] &&
      texts[1] === trueFalseOptionTexts[1];
    if (!isTrueFalse) {
      problems.push({
        field: 'options',
        message: 'A true/false question has the answers True and False.',
      });
    }
  } else {
    if (texts.length < limits.minimumMultipleChoiceOptions) {
      problems.push({
        field: 'options',
        message: `Add at least ${limits.minimumMultipleChoiceOptions} answers.`,
      });
    } else if (texts.length > limits.maximumMultipleChoiceOptions) {
      problems.push({
        field: 'options',
        message: `Use at most ${limits.maximumMultipleChoiceOptions} answers (there are ${texts.length}).`,
      });
    }
    texts.forEach((text, index) => {
      if (text.length === 0) {
        problems.push({ field: `option-${index}`, message: `Answer ${index + 1} is empty.` });
      } else if (text.length > limits.optionLength) {
        problems.push({
          field: `option-${index}`,
          message: `Answer ${index + 1} is too long (${text.length} characters; the limit is ${limits.optionLength}).`,
        });
      }
    });
    const firstIndexOf = new Map<string, number>();
    texts.forEach((text, index) => {
      if (text.length === 0) return;
      const key = text.toLocaleLowerCase();
      const earlier = firstIndexOf.get(key);
      if (earlier === undefined) {
        firstIndexOf.set(key, index);
      } else {
        problems.push({
          field: `option-${index}`,
          message: `Answers ${earlier + 1} and ${index + 1} are the same.`,
        });
      }
    });
  }

  const correctCount = question.options.filter((option) => option.isCorrect).length;
  if (correctCount === 0) {
    problems.push({ field: 'correct', message: 'Mark the correct answer.' });
  } else if (correctCount > 1) {
    problems.push({ field: 'correct', message: 'Mark only one correct answer.' });
  }
  return problems;
}

/** How close a set is to being usable in a game. */
export interface QuestionSetReadiness {
  playable: boolean;
  /** Questions still needed before a game can use the set; 0 when playable. */
  questionsNeeded: number;
}

/** Whether a set with `questionCount` questions can be used in a game. */
export function questionSetReadiness(questionCount: number): QuestionSetReadiness {
  const questionsNeeded = Math.max(
    0,
    questionAuthoringLimits.minimumQuestionsToPlay - questionCount,
  );
  return { playable: questionsNeeded === 0, questionsNeeded };
}

/** A written question; trims its text and rejects anything {@link findQuestionProblems} finds. */
export const authoredQuestionSchema = z
  .object({
    type: z.enum(questionTypes),
    prompt: z.string().trim(),
    options: z
      .array(z.object({ text: z.string().trim(), isCorrect: z.boolean() }))
      // Only a guard against absurd input; findQuestionProblems gives the real limit and wording.
      .max(20),
  })
  .superRefine((question, context) => {
    for (const problem of findQuestionProblems(question)) {
      context.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
    }
  });

/** A written question set, as the editor saves it and the server checks it. */
export const authoredQuestionSetSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the set a title.')
    .max(
      questionAuthoringLimits.titleLength,
      `Keep the title under ${questionAuthoringLimits.titleLength} characters.`,
    ),
  description: z
    .string()
    .trim()
    .max(
      questionAuthoringLimits.descriptionLength,
      `Keep the description under ${questionAuthoringLimits.descriptionLength} characters.`,
    )
    .default(''),
  questions: z
    .array(authoredQuestionSchema)
    .max(
      questionAuthoringLimits.maximumQuestionsPerSet,
      `A set can hold at most ${questionAuthoringLimits.maximumQuestionsPerSet} questions.`,
    ),
});

/** One problem found while checking a whole set, with the question it belongs to (0-based). */
export interface QuestionSetProblem {
  /** Index of the question, or null for the title, description or the set as a whole. */
  questionIndex: number | null;
  field: string;
  message: string;
}

/** Result of {@link checkAuthoredQuestionSet}. */
export type CheckedQuestionSet =
  { ok: true; set: AuthoredQuestionSet } | { ok: false; problems: QuestionSetProblem[] };

/** Checks untrusted input (a form post, a saved draft) as a question set. */
export function checkAuthoredQuestionSet(input: unknown): CheckedQuestionSet {
  const result = authoredQuestionSetSchema.safeParse(input);
  if (result.success) return { ok: true, set: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((issue) => {
      const [first, second, third] = issue.path;
      if (first === 'questions' && typeof second === 'number') {
        return {
          questionIndex: second,
          field: typeof third === 'string' ? third : 'question',
          message: issue.message,
        };
      }
      return {
        questionIndex: null,
        field: typeof first === 'string' ? first : 'set',
        message: issue.message,
      };
    }),
  };
}
