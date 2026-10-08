import { correctOptionOf, type Question } from './question';
import type { AnswerEvent } from './grading';

/** A question the player got wrong at least once, for the results screen. */
export interface MissedQuestion {
  questionId: string;
  prompt: string;
  correctAnswer: string;
  /** How many times it was answered wrongly. */
  timesMissed: number;
}

/** Totals shown on the results screen and stored in reports. */
export interface AnswerSummary {
  answered: number;
  correct: number;
  /** Correct answers as a fraction of answers, 0 when nothing was answered. */
  accuracy: number;
  missed: MissedQuestion[];
}

/** Collects answer events and summarises them. */
export class AnswerLog {
  private readonly events: AnswerEvent[] = [];

  constructor(private readonly questions: readonly Question[]) {}

  /** Adds one event. */
  record(event: AnswerEvent): void {
    this.events.push(event);
  }

  /** Every event so far, oldest first. */
  all(): readonly AnswerEvent[] {
    return this.events;
  }

  /** Totals and missed questions in the order they were first missed. */
  summary(): AnswerSummary {
    const answered = this.events.length;
    const correct = this.events.filter((event) => event.isCorrect).length;
    const missedById = new Map<string, MissedQuestion>();
    for (const event of this.events) {
      if (event.isCorrect) continue;
      const existing = missedById.get(event.questionId);
      if (existing) {
        existing.timesMissed += 1;
        continue;
      }
      const question = this.questions.find((candidate) => candidate.id === event.questionId);
      if (!question) continue;
      missedById.set(event.questionId, {
        questionId: question.id,
        prompt: question.prompt,
        correctAnswer: correctOptionOf(question).text,
        timesMissed: 1,
      });
    }
    return {
      answered,
      correct,
      accuracy: answered === 0 ? 0 : correct / answered,
      missed: [...missedById.values()],
    };
  }
}
