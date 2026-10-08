import { z } from 'zod';
import type { AnswerOutcome } from './session';

/**
 * The wire protocol behind a networked {@link GameSession}: questions, answers and energy.
 * The server is authoritative: it picks questions, grades answers and keeps the energy
 * balance. Devices predict spending so movement feels instant, and reconcile with the
 * server's {@link EnergyState}.
 */

/** Requests a player sends and the room answers (Colyseus `room.request`). */
export const sessionRequestTypes = {
  /** The question waiting for an answer; answered with a `PresentedQuestion`. */
  question: 'session:question',
  /** Answers the current question; answered with an {@link AnswerReply}. */
  answer: 'session:answer',
  /** The player's energy right now; answered with an {@link EnergyState}. */
  energy: 'session:energy',
} as const;

/** Messages between a player and the room about energy. */
export const sessionMessageTypes = {
  /** Player → room: energy spent on the device, as a {@link SpendBatch}. */
  spend: 'session:spend',
  /** Room → player: the server's {@link EnergyState} after a change. */
  energyChanged: 'session:energyChanged',
} as const;

/** Payload of the answer request. */
export const answerRequestSchema = z
  .object({
    questionId: z.string().min(1).max(64),
    chosenOptionId: z.string().min(1).max(64),
  })
  .strict();

/** An answer as sent by a player. */
export type AnswerRequest = z.infer<typeof answerRequestSchema>;

/**
 * Spends reported by a device, numbered so the server applies each exactly once even when
 * a batch is resent after a reconnect. Spend `firstSeq + i` was for `reasons[i]`. The server
 * charges its own price for each reason; the device never says how much.
 */
export const spendBatchSchema = z
  .object({
    firstSeq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    reasons: z.array(z.string().min(1).max(32)).min(1).max(64),
  })
  .strict();

/** A batch of spends from a device. */
export type SpendBatch = z.infer<typeof spendBatchSchema>;

/** The server's energy for one player. */
export interface EnergyState {
  energy: number;
  /** Highest spend sequence number the server has applied. */
  spendSeq: number;
  /** Increases with every change, so a device can ignore stale states. */
  version: number;
}

/** Reply to the answer request. */
export interface AnswerReply {
  outcome: AnswerOutcome;
  energyState: EnergyState;
}

/**
 * Why the server refused an answer or a question request. Sent as the request error's
 * message.
 */
export type SessionRefusal =
  | 'notPlaying'
  | 'notAPlayer'
  | 'invalidAnswer'
  | 'notCurrentQuestion'
  | 'tooSoon'
  | 'questionsUnavailable';

/**
 * Milliseconds after a wrong answer before the server takes the next one. The sheet shows
 * the right answer for 2 seconds; the lock is a little shorter so network timing never
 * refuses an honest player, while a forged client still cannot skip the reveal by guessing.
 */
export const wrongAnswerLockMs = 1_500;
