import { createHash } from 'node:crypto';
import {
  wrongAnswerLockMs,
  type AnswerOutcome,
  type EnergyState,
  type PresentedQuestion,
  type SessionRefusal,
} from '@teckin/game-contracts';
import {
  QuestionQuiz,
  createSeededRandom,
  type AnswerEvent,
  type QuestionSet,
} from '@teckin/questions';

/** How a game turns answers into energy and what each move costs. */
export interface EnergyRules {
  /** Energy every player starts with. */
  startingEnergy: number;
  /** Energy added per correct answer (a host setting). */
  energyPerCorrectAnswer: number;
  /**
   * The server's price for a spend reason, or `undefined` for a reason the game does not
   * know (ignored). The device never chooses the price.
   */
  costOf(reason: string): number | undefined;
}

/** One spend as the server applied it. */
export interface AppliedSpend {
  seq: number;
  reason: string;
  /** The price charged (0 when the reason is unknown). */
  cost: number;
  /** False when the player could not afford it: nothing was taken and the move is unpaid. */
  paid: boolean;
}

/** Result of {@link PlayerQuestionSession.answer}. */
export type AnswerResult =
  { ok: true; event: AnswerEvent; outcome: AnswerOutcome } | { ok: false; reason: SessionRefusal };

/**
 * One player's questions and energy on the server: their own quiz over the game's question
 * set, the authoritative balance, and the sequence of spends already applied.
 */
export class PlayerQuestionSession {
  private balance: number;
  private appliedSpendSeq = 0;
  private stateVersion = 0;
  private answersLockedUntilMs = 0;
  private readonly quiz: QuestionQuiz;

  constructor(
    questionSet: QuestionSet,
    private readonly rules: EnergyRules,
    seed: number,
    private readonly now: () => number,
  ) {
    this.balance = rules.startingEnergy;
    this.quiz = new QuestionQuiz(questionSet, { random: createSeededRandom(seed), now });
  }

  get energy(): number {
    return this.balance;
  }

  /** The state a device reconciles its prediction with. */
  get state(): EnergyState {
    return { energy: this.balance, spendSeq: this.appliedSpendSeq, version: this.stateVersion };
  }

  /** The question waiting for an answer (the same one until it is answered). */
  question(): PresentedQuestion {
    return this.quiz.currentQuestion();
  }

  /**
   * Grades an answer to the current question. Refuses (as `invalidAnswer`) an answer to any
   * other question or an option that is not part of it, and (as `tooSoon`) an answer during
   * the reveal after a wrong one.
   */
  answer(questionId: string, chosenOptionId: string): AnswerResult {
    const nowMs = this.now();
    if (nowMs < this.answersLockedUntilMs) return { ok: false, reason: 'tooSoon' };
    let event: AnswerEvent;
    try {
      event = this.quiz.submitAnswer(questionId, chosenOptionId);
    } catch {
      return { ok: false, reason: 'invalidAnswer' };
    }
    const energyGained = event.isCorrect ? this.rules.energyPerCorrectAnswer : 0;
    if (energyGained > 0) this.setBalance(this.balance + energyGained);
    if (!event.isCorrect) this.answersLockedUntilMs = nowMs + wrongAnswerLockMs;
    return {
      ok: true,
      event,
      outcome: {
        questionId,
        chosenOptionId,
        isCorrect: event.isCorrect,
        correctOptionId: event.correctOptionId,
        correctAnswerText: this.quiz.correctAnswerText(questionId),
        energyGained,
        energy: this.balance,
      },
    };
  }

  /**
   * Applies a batch of spends from the device. Spends already applied (a batch resent after
   * a reconnect) are skipped, so each is charged once. A spend the player cannot afford
   * takes nothing and comes back unpaid, so the game can refuse the move it was for.
   */
  applySpends(firstSeq: number, reasons: readonly string[]): AppliedSpend[] {
    const applied: AppliedSpend[] = [];
    reasons.forEach((reason, index) => {
      const seq = firstSeq + index;
      if (seq <= this.appliedSpendSeq) return;
      this.appliedSpendSeq = seq;
      const cost = this.rules.costOf(reason) ?? 0;
      const paid = cost <= this.balance;
      if (paid && cost > 0) this.setBalance(this.balance - cost);
      applied.push({ seq, reason, cost, paid });
    });
    if (applied.length > 0) this.stateVersion += 1;
    return applied;
  }

  /** Answer totals so far. */
  answerTotals(): { answered: number; correct: number } {
    const summary = this.quiz.summary();
    return { answered: summary.answered, correct: summary.correct };
  }

  private setBalance(energy: number): void {
    this.balance = Math.max(0, energy);
    this.stateVersion += 1;
  }
}

/**
 * Every player's {@link PlayerQuestionSession} in one game. Each player gets their own deck
 * order, seeded from the game and player ids so a test can repeat it.
 */
export class QuestionSessions {
  private readonly sessions = new Map<string, PlayerQuestionSession>();

  constructor(
    readonly questionSet: QuestionSet,
    readonly rules: EnergyRules,
    private readonly gameSeed: string,
    private readonly now: () => number,
  ) {
    if (questionSet.questions.length === 0) throw new Error('The question set is empty');
  }

  /** The player's session, created on first use. */
  forPlayer(playerId: string): PlayerQuestionSession {
    let session = this.sessions.get(playerId);
    if (!session) {
      session = new PlayerQuestionSession(
        this.questionSet,
        this.rules,
        seedFrom(`${this.gameSeed}:${playerId}`),
        this.now,
      );
      this.sessions.set(playerId, session);
    }
    return session;
  }

  /** The player's session if they have one. */
  find(playerId: string): PlayerQuestionSession | undefined {
    return this.sessions.get(playerId);
  }
}

function seedFrom(text: string): number {
  return createHash('sha256').update(text).digest().readUInt32LE(0);
}
