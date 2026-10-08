import { correctOptionOf, type Question } from './question';

/**
 * The record of one answer. Matches the `AnswerEvent` table of the data model, so the same
 * object is logged locally now and stored by the server in Phase 4.
 */
export interface AnswerEvent {
  questionId: string;
  chosenOptionId: string;
  correctOptionId: string;
  isCorrect: boolean;
  /** Time from showing the question to answering it. */
  millisecondsTaken: number;
}

/**
 * Grades `chosenOptionId` against `question`. Throws if the option does not belong to the
 * question, so a forged or stale answer is never counted.
 */
export function gradeAnswer(
  question: Question,
  chosenOptionId: string,
  millisecondsTaken: number,
): AnswerEvent {
  if (!question.options.some((option) => option.id === chosenOptionId)) {
    throw new Error(`Option "${chosenOptionId}" is not part of question "${question.id}"`);
  }
  const correct = correctOptionOf(question);
  return {
    questionId: question.id,
    chosenOptionId,
    correctOptionId: correct.id,
    isCorrect: correct.id === chosenOptionId,
    millisecondsTaken: Math.max(
      0,
      Math.round(Number.isFinite(millisecondsTaken) ? millisecondsTaken : 0),
    ),
  };
}
