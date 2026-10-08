import type { GameEndReason } from './live-game';

/**
 * Everything a game session reports for the record, as a game room sends it. `sessionId` is the
 * room id. Events carry player ids and nicknames only (and a hash of the device key).
 */
export type SessionRecordEventBody =
  | { type: 'sessionStarted'; sessionId: string; gameId: string; joinCode: string; atMs: number }
  | { type: 'playStarted'; sessionId: string; atMs: number }
  | {
      type: 'playerJoined';
      sessionId: string;
      playerId: string;
      nickname: string;
      /** Hash of the device key the player reconnects with; never the key itself. */
      reconnectTokenHash: string;
      atMs: number;
    }
  | { type: 'playerRenamed'; sessionId: string; playerId: string; nickname: string; atMs: number }
  | { type: 'playerRemoved'; sessionId: string; playerId: string; atMs: number }
  | {
      type: 'answer';
      sessionId: string;
      playerId: string;
      questionId: string;
      chosenOptionId: string;
      isCorrect: boolean;
      millisecondsTaken: number;
      atMs: number;
    }
  | {
      type: 'progress';
      sessionId: string;
      playerId: string;
      /** Game-specific progress, such as `{ summit: 3, metres: 512 }`. */
      details: Record<string, number | string>;
      atMs: number;
    }
  | {
      type: 'result';
      sessionId: string;
      playerId: string;
      rank: number;
      /** Game-specific stats for the report, such as best height and summits reached. */
      stats: Record<string, number | string>;
      atMs: number;
    }
  | { type: 'sessionEnded'; sessionId: string; reason: GameEndReason; atMs: number };

/**
 * Which database record and organisation a room's events belong to. Rooms launched from the web
 * app have both; rooms made by tests and the load test have neither and are not stored.
 */
export interface SessionRecordContext {
  gameSessionId?: string;
  organisationId?: string;
}

/**
 * One recorded event with its context. `sessionEnded` is always a session's last event: a
 * game's `result` events come before it.
 */
export type SessionRecordEvent = SessionRecordEventBody & SessionRecordContext;

/** Receives every answer, progress and result event of a game session. */
export interface SessionRecorder {
  record(event: SessionRecordEvent): void | Promise<void>;
}

/** Keeps every event in memory, in order. Used in Phase 3 and by tests. */
export class InMemorySessionRecorder implements SessionRecorder {
  private readonly recorded: SessionRecordEvent[] = [];

  record(event: SessionRecordEvent): void {
    this.recorded.push(event);
  }

  /** All events, optionally only those of one session. */
  events(sessionId?: string): readonly SessionRecordEvent[] {
    return sessionId === undefined
      ? this.recorded
      : this.recorded.filter((event) => event.sessionId === sessionId);
  }

  /** Forgets everything recorded for a session (or everything). */
  clear(sessionId?: string): void {
    if (sessionId === undefined) {
      this.recorded.length = 0;
      return;
    }
    const kept = this.recorded.filter((event) => event.sessionId !== sessionId);
    this.recorded.splice(0, this.recorded.length, ...kept);
  }
}
