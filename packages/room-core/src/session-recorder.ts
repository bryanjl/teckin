import type { GameEndReason } from './live-game';

/**
 * Everything a game session reports for the record. Phase 4 stores these in the database for
 * reports; Phase 3 keeps them in memory. Events carry player ids and nicknames only.
 */
export type SessionRecordEvent =
  | { type: 'sessionStarted'; sessionId: string; gameId: string; atMs: number }
  | { type: 'playerJoined'; sessionId: string; playerId: string; nickname: string; atMs: number }
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
