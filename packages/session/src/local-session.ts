import type {
  AnswerOutcome,
  AnswerSummary,
  EnergyChange,
  EnergySpendReason,
  GameSession,
  PresentedQuestion,
  ProgressEvent,
} from '@teckin/game-contracts';
import { QuestionQuiz, type QuestionSet, type RandomSource } from '@teckin/questions';

/** Options for {@link LocalSession}. */
export interface LocalSessionOptions {
  questionSet: QuestionSet;
  /** Energy at the start (and after `reset`). */
  startingEnergy: number;
  /** Energy added per correct answer (a host setting). */
  energyPerCorrectAnswer: number;
  /** Random source for the deck; seed it for repeatable runs. */
  random?: RandomSource;
  /** Clock in milliseconds for timing answers; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * A {@link GameSession} that runs entirely on the device, for solo play. Owns the question
 * quiz and the energy balance; energy only rises on correct answers and only falls through
 * `spendEnergy`, never below zero.
 */
export class LocalSession implements GameSession {
  private quiz: QuestionQuiz;
  private balance: number;
  private readonly listeners = new Set<(change: EnergyChange) => void>();
  private readonly progressLog: ProgressEvent[] = [];

  constructor(private readonly options: LocalSessionOptions) {
    assertWholeNonNegative(options.startingEnergy, 'startingEnergy');
    assertWholeNonNegative(options.energyPerCorrectAnswer, 'energyPerCorrectAnswer');
    this.quiz = this.createQuiz();
    this.balance = options.startingEnergy;
  }

  get energy(): number {
    return this.balance;
  }

  async currentQuestion(): Promise<PresentedQuestion> {
    return this.quiz.currentQuestion();
  }

  async submitAnswer(questionId: string, chosenOptionId: string): Promise<AnswerOutcome> {
    const event = this.quiz.submitAnswer(questionId, chosenOptionId);
    const energyGained = event.isCorrect ? this.options.energyPerCorrectAnswer : 0;
    if (energyGained > 0) this.change(energyGained, 'answer');
    return {
      questionId,
      chosenOptionId,
      isCorrect: event.isCorrect,
      correctOptionId: event.correctOptionId,
      correctAnswerText: this.quiz.correctAnswerText(questionId),
      energyGained,
      energy: this.balance,
    };
  }

  spendEnergy(amount: number, reason: EnergySpendReason): boolean {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Cannot spend ${amount} energy`);
    if (amount === 0) return true;
    if (amount > this.balance) return false;
    this.change(-amount, reason);
    return true;
  }

  reportProgress(event: ProgressEvent): void {
    this.progressLog.push(event);
  }

  /** Progress reported so far, oldest first. */
  progress(): readonly ProgressEvent[] {
    return this.progressLog;
  }

  onEnergyChange(listener: (change: EnergyChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  answerSummary(): AnswerSummary {
    return this.quiz.summary();
  }

  reset(): void {
    this.quiz = this.createQuiz();
    this.progressLog.length = 0;
    this.change(this.options.startingEnergy - this.balance, 'reset');
  }

  /**
   * The correct option for a question in this set. Solo debug and test tooling only (the
   * autopilot answers with it); a network session never has the answers on the device.
   */
  correctOptionFor(questionId: string): string {
    const question = this.options.questionSet.questions.find((item) => item.id === questionId);
    const option = question?.options.find((item) => item.isCorrect);
    if (!option) throw new Error(`Unknown question "${questionId}"`);
    return option.id;
  }

  private createQuiz(): QuestionQuiz {
    return new QuestionQuiz(this.options.questionSet, {
      ...(this.options.random ? { random: this.options.random } : {}),
      ...(this.options.now ? { now: this.options.now } : {}),
    });
  }

  private change(delta: number, reason: EnergyChange['reason']): void {
    if (delta === 0) return;
    this.balance = Math.max(0, this.balance + delta);
    const change: EnergyChange = { energy: this.balance, delta, reason };
    for (const listener of this.listeners) listener(change);
  }
}

function assertWholeNonNegative(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number ≥ 0`);
}
