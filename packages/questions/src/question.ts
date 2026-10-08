import { z } from 'zod';

/** Question types supported at launch. Typed answers come later. */
export const questionTypes = ['multipleChoice', 'trueFalse'] as const;

/** One of {@link questionTypes}. */
export type QuestionType = (typeof questionTypes)[number];

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'ids use letters, digits, "-" and "_" only');

/** An answer option, including whether it is the right one. Never sent to players as is. */
export const answerOptionSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(200),
  isCorrect: z.boolean(),
});

/** A single answer option of a {@link Question}. */
export type AnswerOption = z.infer<typeof answerOptionSchema>;

/**
 * A question with its options. Multiple choice has 2 to 4 options; true/false has exactly
 * two. Either way exactly one option is correct and option ids are unique.
 */
export const questionSchema = z
  .object({
    id: idSchema,
    type: z.enum(questionTypes),
    prompt: z.string().trim().min(1).max(300),
    options: z.array(answerOptionSchema).min(2).max(4),
  })
  .superRefine((question, context) => {
    const correct = question.options.filter((option) => option.isCorrect).length;
    if (correct !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: `exactly one option must be correct (found ${correct})`,
      });
    }
    if (question.type === 'trueFalse' && question.options.length !== 2) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'true/false questions have exactly two options',
      });
    }
    const ids = new Set(question.options.map((option) => option.id));
    if (ids.size !== question.options.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'option ids must be unique' });
    }
    const texts = new Set(question.options.map((option) => option.text.toLowerCase()));
    if (texts.size !== question.options.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'options must differ' });
    }
  });

/** A question with its options and answer. */
export type Question = z.infer<typeof questionSchema>;

/** A named list of questions, such as a sample set or (later) a host's set. */
export const questionSetSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(''),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((set, context) => {
    const ids = new Set(set.questions.map((question) => question.id));
    if (ids.size !== set.questions.length) {
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'question ids must be unique',
      });
    }
  });

/** A validated question set. */
export type QuestionSet = z.infer<typeof questionSetSchema>;

/**
 * What a player sees of a question: the prompt and options without the answer. The server
 * sends only this in Phase 3, so the correct option never reaches a player's device early.
 */
export interface PresentedQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: { id: string; text: string }[];
}

/** Validates unknown data (seed JSON, an upload) as a question set, throwing a readable error. */
export function parseQuestionSet(data: unknown): QuestionSet {
  const result = questionSetSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(set)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid question set: ${issues}`);
  }
  return result.data;
}

/** The correct option of `question`. */
export function correctOptionOf(question: Question): AnswerOption {
  const option = question.options.find((candidate) => candidate.isCorrect);
  if (!option) throw new Error(`Question "${question.id}" has no correct option`);
  return option;
}

/** Strips the answer from `question`, keeping options in the order given. */
export function presentQuestion(
  question: Question,
  optionOrder: readonly AnswerOption[] = question.options,
): PresentedQuestion {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: optionOrder.map(({ id, text }) => ({ id, text })),
  };
}
