import {
  organisationData,
  RecordNotFoundError,
  storeLiveJoinCode,
  type NewAnswerEvent,
  type OrganisationData,
} from '@teckin/db';
import type { PrismaClient } from '@teckin/db/client';
import type { SessionRecordEvent, SessionRecorder } from '@teckin/room-core';

/** One live game's bookkeeping while its events are written. */
interface RecordedSession {
  gameSessionId: string;
  data: OrganisationData;
  /** Room player id → database participant id. */
  participantIds: Map<string, string>;
  /** Writes run one after another, in the order the room sent the events. */
  queue: Promise<void>;
  /** Answers waiting to be written together. */
  pendingAnswers: (NewAnswerEvent & { playerId: string })[];
  answerFlushQueued: boolean;
  /** Set when the game's record is gone (account deleted): later events are dropped. */
  gone: boolean;
}

/** Options for {@link DatabaseSessionRecorder}. */
export interface DatabaseSessionRecorderOptions {
  /** Where write failures are reported; ids only, never nicknames. */
  logError?: (message: string, details: Record<string, unknown>) => void;
}

/**
 * Stores what game rooms report: the game's start and end (and its join code while live),
 * players (nickname and a hashed reconnect token only), every answer and the final results.
 * Every write goes through the organisation-scoped data layer for the organisation the web
 * app signed into the room's launch, so a room can only ever write to its own organisation.
 *
 * Writes for one game run in order on their own queue, so an answer never arrives before its
 * player's row; answers that arrive while a write is running are stored together in one query.
 * Rooms without a database record (tests, the load test) are ignored.
 */
export class DatabaseSessionRecorder implements SessionRecorder {
  private readonly sessions = new Map<string, RecordedSession>();
  private readonly logError: NonNullable<DatabaseSessionRecorderOptions['logError']>;

  constructor(
    private readonly database: PrismaClient,
    options: DatabaseSessionRecorderOptions = {},
  ) {
    this.logError = options.logError ?? ((message, details) => console.error(message, details));
  }

  record(event: SessionRecordEvent): void {
    if (!event.gameSessionId || !event.organisationId) return;
    const session = this.sessionFor(event.sessionId, event.gameSessionId, event.organisationId);
    if (session.gone) return;
    if (event.type === 'answer') {
      session.pendingAnswers.push({
        playerId: event.playerId,
        participantId: '',
        questionId: event.questionId,
        chosenOptionId: event.chosenOptionId,
        isCorrect: event.isCorrect,
        millisecondsTaken: Math.max(0, Math.round(event.millisecondsTaken)),
        createdAt: new Date(event.atMs),
      });
      if (!session.answerFlushQueued) {
        session.answerFlushQueued = true;
        this.enqueue(event.sessionId, session, () => this.flushAnswers(session));
      }
      return;
    }
    this.enqueue(event.sessionId, session, () => this.write(session, event));
    if (event.type === 'sessionEnded') {
      void session.queue.then(() => {
        if (this.sessions.get(event.sessionId) === session) this.sessions.delete(event.sessionId);
      });
    }
  }

  /** Resolves when every write queued so far has finished (tests, shutdown). */
  async flush(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => session.queue));
  }

  /** Games with writes still being tracked; a game is forgotten once it has ended. */
  get trackedSessionCount(): number {
    return this.sessions.size;
  }

  private sessionFor(roomId: string, gameSessionId: string, organisationId: string) {
    const existing = this.sessions.get(roomId);
    if (existing) return existing;
    const created: RecordedSession = {
      gameSessionId,
      data: organisationData(this.database, organisationId),
      participantIds: new Map(),
      queue: Promise.resolve(),
      pendingAnswers: [],
      answerFlushQueued: false,
      gone: false,
    };
    this.sessions.set(roomId, created);
    return created;
  }

  private enqueue(roomId: string, session: RecordedSession, work: () => Promise<void>): void {
    session.queue = session.queue.then(async () => {
      if (session.gone) return;
      try {
        await work();
      } catch (error) {
        if (error instanceof RecordNotFoundError) {
          // The game or its organisation was deleted mid-game; nothing more can be stored.
          session.gone = true;
          return;
        }
        this.logError('Session recorder write failed', {
          sessionId: roomId,
          gameSessionId: session.gameSessionId,
          error,
        });
      }
    });
  }

  private async flushAnswers(session: RecordedSession): Promise<void> {
    session.answerFlushQueued = false;
    const batch = session.pendingAnswers.splice(0);
    const events: NewAnswerEvent[] = [];
    for (const { playerId, ...answer } of batch) {
      const participantId = session.participantIds.get(playerId);
      if (participantId) events.push({ ...answer, participantId });
    }
    if (events.length > 0) await session.data.answerEvents.record(session.gameSessionId, events);
  }

  private async write(session: RecordedSession, event: SessionRecordEvent): Promise<void> {
    const { data, gameSessionId } = session;
    switch (event.type) {
      case 'sessionStarted':
        await storeLiveJoinCode(this.database, {
          gameSessionId,
          organisationId: data.organisationId,
          joinCode: event.joinCode,
        });
        return;
      case 'playStarted':
        await data.gameSessions.markStarted(gameSessionId, new Date(event.atMs));
        return;
      case 'playerJoined': {
        const participant = await data.participants.add(gameSessionId, {
          nickname: event.nickname,
          reconnectTokenHash: event.reconnectTokenHash,
        });
        session.participantIds.set(event.playerId, participant.id);
        return;
      }
      case 'playerRenamed': {
        const participantId = session.participantIds.get(event.playerId);
        if (participantId) await data.participants.rename(participantId, event.nickname);
        return;
      }
      case 'playerRemoved': {
        const participantId = session.participantIds.get(event.playerId);
        if (participantId) await data.participants.markRemoved(participantId, new Date(event.atMs));
        return;
      }
      case 'result': {
        const participantId = session.participantIds.get(event.playerId);
        if (participantId) {
          await data.results.record(gameSessionId, {
            participantId,
            rank: event.rank,
            gameStats: event.stats,
          });
        }
        return;
      }
      case 'sessionEnded':
        await data.gameSessions.markEnded(gameSessionId, new Date(event.atMs));
        return;
      case 'progress':
        // Summits along the way are live-only; the final result holds what reports need.
        return;
      case 'answer':
        return;
    }
  }
}
