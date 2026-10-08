import { AnswerLog, type AnswerSummary } from './answer-log';
import { QuestionDeck, type QuestionDeckOptions } from './deck';
import { gradeAnswer, type AnswerEvent } from './grading';
import {
  presentQuestion,
  type PresentedQuestion,
  type Question,
  type QuestionSet,
} from './question';
import { shuffled, type RandomSource } from './random';

/** Options for {@link QuestionQuiz}. */
export interface QuestionQuizOptions extends QuestionDeckOptions {
  /** Shuffle multiple-choice options each time a question is shown (default true). */
  shuffleOptions?: boolean;
  /** Clock in milliseconds, for timing answers; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * One player's run through a question set: draws questions from a {@link QuestionDeck},
 * presents them without answers, grades answers, feeds results back to the deck's retry
 * rule and logs every answer. Pure TypeScript, so the Phase 3 server runs it unchanged.
 */
export class QuestionQuiz {
  private readonly deck: QuestionDeck;
  private readonly log: AnswerLog;
  private readonly random: RandomSource;
  private readonly shuffleOptions: boolean;
  private readonly now: () => number;
  private current:
    { question: Question; presented: PresentedQuestion; shownAt: number } | undefined;

  constructor(
    readonly questionSet: QuestionSet,
    options: QuestionQuizOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.deck = new QuestionDeck(questionSet.questions, { ...options, random: this.random });
    this.log = new AnswerLog(questionSet.questions);
    this.shuffleOptions = options.shuffleOptions ?? true;
    this.now = options.now ?? Date.now;
  }

  /**
   * The question waiting for an answer. Calling it again before answering returns the same
   * question, so closing and reopening the sheet cannot be used to skip one.
   */
  currentQuestion(): PresentedQuestion {
    if (!this.current) {
      const question = this.deck.draw();
      const order =
        this.shuffleOptions && question.type === 'multipleChoice'
          ? shuffled(question.options, this.random)
          : question.options;
      this.current = { question, presented: presentQuestion(question, order), shownAt: this.now() };
    }
    return this.current.presented;
  }

  /** Grades an answer to the current question, logs it and moves on. */
  submitAnswer(questionId: string, chosenOptionId: string): AnswerEvent {
    const current = this.current;
    if (!current || current.question.id !== questionId) {
      throw new Error(`Question "${questionId}" is not the one being asked`);
    }
    const event = gradeAnswer(current.question, chosenOptionId, this.now() - current.shownAt);
    this.deck.recordResult(questionId, event.isCorrect);
    this.log.record(event);
    this.current = undefined;
    return event;
  }

  /** Text of the correct option for a question in this set, for showing after a wrong answer. */
  correctAnswerText(questionId: string): string {
    const question = this.questionSet.questions.find((candidate) => candidate.id === questionId);
    const option = question?.options.find((candidate) => candidate.isCorrect);
    if (!option) throw new Error(`Unknown question "${questionId}"`);
    return option.text;
  }

  /** Every answer so far. */
  answers(): readonly AnswerEvent[] {
    return this.log.all();
  }

  /** Totals and missed questions. */
  summary(): AnswerSummary {
    return this.log.summary();
  }
}
