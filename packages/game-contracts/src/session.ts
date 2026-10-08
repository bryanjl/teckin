import type { AnswerSummary, PresentedQuestion } from '@teckin/questions';

export type { AnswerSummary, MissedQuestion, PresentedQuestion } from '@teckin/questions';

/** Why energy was spent, for logs, reports and (later) server-side movement checks. */
export type EnergySpendReason = 'jump' | 'airJump' | 'walk' | (string & {});

/** What happened when a player answered a question. */
export interface AnswerOutcome {
  questionId: string;
  chosenOptionId: string;
  isCorrect: boolean;
  correctOptionId: string;
  /** Text of the correct option, shown after a wrong answer. */
  correctAnswerText: string;
  /** Energy added by this answer (0 when wrong). */
  energyGained: number;
  /** Energy after the answer. */
  energy: number;
}

/** A change to the player's energy. */
export interface EnergyChange {
  energy: number;
  /** Positive when earned, negative when spent. */
  delta: number;
  reason: 'answer' | EnergySpendReason;
}

/** Something the game reports about the player's progress. */
export type ProgressEvent =
  | { type: 'goalReached'; goalIndex: number; elapsedSeconds: number }
  | { type: 'height'; metres: number }
  | { type: 'finished'; elapsedSeconds: number };

/**
 * A game's private line to its multiplayer room, for game-specific messages such as the
 * Climber's position reports. Only networked sessions have one.
 */
export interface RealtimeChannel {
  /** This player's stable id in the room (survives reconnects). */
  readonly playerId: string;
  /**
   * Sends a game message to the room. Energy spent before it is delivered first, so the
   * room always sees spends before the movement they paid for.
   */
  send(type: string, payload: unknown): void;
  /** Sends a request and resolves with the room's reply. */
  request<Reply>(type: string, payload?: unknown): Promise<Reply>;
  /** Listens for a game message from the room. Returns an unsubscribe function. */
  onMessage(type: string, listener: (payload: unknown) => void): () => void;
}

/**
 * The game's only link to questions and energy. The server is authoritative in Phase 3:
 * `LocalSession` runs everything on the device for solo play, and `NetworkSession` will
 * forward the same calls to the room. Games never import the question engine directly.
 */
export interface GameSession {
  /** The question waiting for an answer; the same one until it is answered. */
  currentQuestion(): Promise<PresentedQuestion>;
  /** Answers the current question. */
  submitAnswer(questionId: string, chosenOptionId: string): Promise<AnswerOutcome>;
  /** Energy right now. */
  readonly energy: number;
  /**
   * Spends `amount` energy if the player has that much; returns false (spending nothing)
   * otherwise. Movement is predicted on the device, so this answers at once.
   */
  spendEnergy(amount: number, reason: EnergySpendReason): boolean;
  /** Reports progress such as a summit reached or the course finished. */
  reportProgress(event: ProgressEvent): void;
  /** Calls `listener` after every energy change. Returns an unsubscribe function. */
  onEnergyChange(listener: (change: EnergyChange) => void): () => void;
  /** Answer totals and missed questions so far. */
  answerSummary(): AnswerSummary;
  /** Starts again with full starting energy and a fresh answer log (solo play only). */
  reset(): void;
  /** The link to the multiplayer room; absent in solo play. */
  readonly realtime?: RealtimeChannel;
}
