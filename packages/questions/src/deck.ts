import type { Question } from './question';
import { shuffled, type RandomSource } from './random';

/** Options for {@link QuestionDeck}. */
export interface QuestionDeckOptions {
  /** Random source for shuffling; defaults to `Math.random`. */
  random?: RandomSource;
  /** How many other questions are shown before a wrongly answered one comes back. */
  retryAfter?: number;
}

interface PendingRetry {
  questionId: string;
  othersToWait: number;
}

/**
 * The order questions are shown in. Questions come in a shuffled cycle with no repeats until
 * every question has been seen; then a new shuffled cycle starts. A question answered wrongly
 * comes back after `retryAfter` (default 3) other questions, ahead of the cycle. With fewer
 * questions than that, a retry comes back as soon as nothing else is left to show.
 */
export class QuestionDeck {
  private readonly random: RandomSource;
  private readonly retryAfter: number;
  private readonly byId: ReadonlyMap<string, Question>;
  private cycle: string[] = [];
  private retries: PendingRetry[] = [];
  private lastDrawnId: string | undefined;

  constructor(
    private readonly questions: readonly Question[],
    options: QuestionDeckOptions = {},
  ) {
    if (questions.length === 0) throw new Error('A deck needs at least one question');
    this.random = options.random ?? Math.random;
    this.retryAfter = options.retryAfter ?? 3;
    this.byId = new Map(questions.map((question) => [question.id, question]));
  }

  /** Number of questions in the deck. */
  get size(): number {
    return this.questions.length;
  }

  /** The next question to show. */
  draw(): Question {
    const nextId = this.takeDueRetry() ?? this.takeFromCycle();
    for (const retry of this.retries) {
      if (retry.questionId !== nextId) retry.othersToWait -= 1;
    }
    this.lastDrawnId = nextId;
    return this.questionById(nextId);
  }

  /** Records how a drawn question was answered; a wrong answer schedules a retry. */
  recordResult(questionId: string, isCorrect: boolean): void {
    this.questionById(questionId);
    this.retries = this.retries.filter((retry) => retry.questionId !== questionId);
    if (!isCorrect) this.retries.push({ questionId, othersToWait: this.retryAfter });
  }

  private takeDueRetry(): string | undefined {
    const dueIndex = this.retries.findIndex((retry) => retry.othersToWait <= 0);
    if (dueIndex >= 0) return this.removeRetryAt(dueIndex);
    // Nothing else could be shown: bring the retry back early rather than repeat a cycle.
    const others = this.questions.length - this.retries.length;
    if (this.retries.length > 0 && others <= 0) return this.removeRetryAt(0);
    return undefined;
  }

  private removeRetryAt(index: number): string {
    const [retry] = this.retries.splice(index, 1);
    if (!retry) throw new Error('No retry at that index');
    this.cycle = this.cycle.filter((id) => id !== retry.questionId);
    return retry.questionId;
  }

  private takeFromCycle(): string {
    const waiting = new Set(this.retries.map((retry) => retry.questionId));
    let nextId = this.cycle.find((id) => !waiting.has(id));
    if (nextId === undefined) {
      this.cycle = this.newCycle(waiting);
      nextId = this.cycle.find((id) => !waiting.has(id));
    }
    if (nextId === undefined) {
      // Every question is waiting for a retry; show the one closest to due.
      return this.removeRetryAt(0);
    }
    this.cycle = this.cycle.filter((id) => id !== nextId);
    return nextId;
  }

  private newCycle(waiting: ReadonlySet<string>): string[] {
    const order = shuffled(
      this.questions.map((question) => question.id).filter((id) => !waiting.has(id)),
      this.random,
    );
    // Never show the same question twice in a row across a cycle boundary.
    if (order.length > 1 && order[0] === this.lastDrawnId) {
      const first = order.shift() as string;
      order.push(first);
    }
    return order;
  }

  private questionById(id: string): Question {
    const question = this.byId.get(id);
    if (!question) throw new Error(`Unknown question "${id}"`);
    return question;
  }
}
