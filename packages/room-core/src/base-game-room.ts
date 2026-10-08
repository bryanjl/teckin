import { createHash } from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import {
  clientRequestTypes,
  hostMessageSchemas,
  hostMessageTypes,
  joinRefusedErrorCode,
  roomCloseCodes,
  roomJoinOptionsSchema,
  roomSettingsSchema,
  serverMessageTypes,
  answerRequestSchema,
  sessionMessageTypes,
  sessionRequestTypes,
  spendBatchSchema,
  type AnswerReply,
  type EnergyState,
  type HostCommandRejectedMessage,
  type JoinRefusal,
  type PresentedQuestion,
  type RoomSettings,
  type SessionRefusal,
  type WelcomeMessage,
} from '@teckin/game-contracts';
import { isSampleQuestionSetId, sampleQuestionSets, type QuestionSet } from '@teckin/questions';
import { z } from 'zod';
import { createJoinCodeRegistry, type JoinCodeRegistry } from './join-codes';
import {
  LiveGame,
  type GameEndReason,
  type LiveGameEvent,
  type LivePlayer,
  type NicknameCheck,
} from './live-game';
import {
  QuestionSessions,
  type AnswerResult,
  type AppliedSpend,
  type EnergyRules,
} from './question-sessions';
import { RosterPlayer, RoomStateBase } from './room-state';
import type { SessionRecorder } from './session-recorder';

/** Hashes a secret (host key or device key) so rooms never hold the raw value. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** What the creator of a game room passes as Colyseus create options. */
export const gameRoomCreateOptionsSchema = z.object({
  /** Game plug-in id, for example "climber". */
  gameId: z.string().min(1),
  /** SHA-256 of the host key; the raw key goes only to the host. */
  hostKeyHash: z.string().regex(/^[0-9a-f]{64}$/),
  settings: roomSettingsSchema.default({
    maxPlayers: 60,
    allowLateJoin: true,
    durationMinutes: 15,
  }),
  /** The game's own settings, validated by the game's room. */
  gameSettings: z.unknown().optional(),
  /** Question set players answer; resolved by {@link RoomServices.loadQuestionSet}. */
  questionSetId: z.string().min(1).max(64).default('maths'),
});

/** Parsed create options. */
export type GameRoomCreateOptions = z.infer<typeof gameRoomCreateOptionsSchema>;

/** Process-wide services rooms use. The realtime app sets them once at start-up. */
export interface RoomServices {
  recorder: SessionRecorder | null;
  /** Overrides the presence-backed join code registry (tests). */
  joinCodes: JoinCodeRegistry | null;
  /** Nickname check, so the profanity filter can be plugged in without touching rooms. */
  checkNickname: NicknameCheck | null;
  /** Seconds a dropped player keeps their seat for an automatic reconnect. */
  reconnectSeconds: number;
  /** Clock, replaceable in tests. */
  now: () => number;
  /**
   * Loads a question set by id. Phase 3 serves the bundled sample sets; Phase 4 reads the
   * host's sets from the database.
   */
  loadQuestionSet: (questionSetId: string) => QuestionSet | Promise<QuestionSet>;
  /**
   * Messages a connection may send per second before it is dropped. Players send about ten
   * position reports and a few spend batches a second; 60 leaves room for bursts. Tests that
   * fast-forward a game raise it.
   */
  maxMessagesPerSecond: number;
}

/** Serves the bundled sample question sets by id. */
export function loadSampleQuestionSet(questionSetId: string): QuestionSet {
  if (!isSampleQuestionSetId(questionSetId)) {
    throw new Error(`Unknown question set "${questionSetId}"`);
  }
  return sampleQuestionSets[questionSetId];
}

/** The services every room reads. Change fields with {@link configureRoomServices}. */
export const roomServices: RoomServices = {
  recorder: null,
  joinCodes: null,
  checkNickname: null,
  reconnectSeconds: 180,
  now: () => Date.now(),
  loadQuestionSet: loadSampleQuestionSet,
  maxMessagesPerSecond: 60,
};

/** Sets process-wide room services (recorder, nickname check, reconnect window). */
export function configureRoomServices(services: Partial<RoomServices>): void {
  Object.assign(roomServices, services);
}

/** Who a connection is, kept on `client.userData`. */
export type RoomClientData = { role: 'host' } | { role: 'player'; playerId: string };

const tickIntervalMs = 250;
/** Join codes outlive the room a little, so a code is never reused mid-game after a slow tick. */
const joinCodeTtlSeconds = 30 * 60;
/** An ended game stays open this long so everyone can read the results. */
const endedRoomLingerMs = 10 * 60_000;
/** A game with nobody connected (host included) is closed after this long. */
const abandonedAfterMs = 30 * 60_000;

class JoinRefused extends ServerError {
  constructor(reason: JoinRefusal) {
    super(joinRefusedErrorCode, reason);
  }
}

/**
 * The base room every game extends: join codes, lobby, host controls (start, end, add time,
 * lock, kick, rename), the 3-2-1 countdown, the server timer, reconnects and the session record.
 * Games override the protected hooks and add their own messages and state.
 *
 * Players are identified by a stable `playerId` that survives reconnects, separate from the
 * Colyseus `sessionId` of the current connection.
 */
export class BaseGameRoom<State extends RoomStateBase = RoomStateBase> extends Room<{
  state: State;
}> {
  protected liveGame!: LiveGame;
  protected joinCode = '';
  protected gameId = '';
  /** Players' questions and energy, once the game called {@link enableQuestionSessions}. */
  protected questionSessions: QuestionSessions | null = null;
  private questionSetId = '';
  private hostKeyHash = '';
  private joinCodes!: JoinCodeRegistry;
  private readonly sessionIdByPlayerId = new Map<string, string>();
  private readonly resumedSessionIds = new Set<string>();
  private lastConnectedAtMs = 0;
  private joinCodeReleased = false;
  private joinCodeRefreshedAtMs = 0;

  /** Creates the synchronised state. Games with extended state override this. */
  protected createState(): State {
    return new RoomStateBase() as State;
  }

  override async onCreate(rawOptions: unknown): Promise<void> {
    const options = gameRoomCreateOptionsSchema.parse(rawOptions);
    const settings: RoomSettings = options.settings;
    this.gameId = options.gameId;
    this.hostKeyHash = options.hostKeyHash;
    this.questionSetId = options.questionSetId;
    this.autoDispose = false;
    this.maxMessagesPerSecond = roomServices.maxMessagesPerSecond;
    // Room cap plus a few seats for host screens (laptop and projector).
    this.maxClients = settings.maxPlayers + 4;
    this.liveGame = new LiveGame(
      {
        maxPlayers: settings.maxPlayers,
        allowLateJoin: settings.allowLateJoin,
        durationMs: settings.durationMinutes * 60_000,
      },
      roomServices.checkNickname ?? undefined,
    );
    this.joinCodes = roomServices.joinCodes ?? createJoinCodeRegistry(this.presence);
    this.joinCode = await this.joinCodes.claim(this.roomId, joinCodeTtlSeconds);
    this.joinCodeRefreshedAtMs = this.now();
    this.lastConnectedAtMs = this.now();

    const state = this.createState();
    state.gameId = options.gameId;
    state.joinCode = this.joinCode;
    state.allowLateJoin = settings.allowLateJoin;
    state.maxPlayers = settings.maxPlayers;
    state.remainingMs = this.liveGame.options.durationMs;
    this.state = state;
    await this.setMetadata({ joinCode: this.joinCode, gameId: this.gameId } as never);

    this.registerHostMessages();
    this.onMessage(clientRequestTypes.whoAmI, (client: Client) => this.whoAmI(client));
    this.clock.setInterval(() => this.tick(), tickIntervalMs);
    this.record({
      type: 'sessionStarted',
      sessionId: this.roomId,
      gameId: this.gameId,
      atMs: this.now(),
    });
    await this.onGameCreated(options);
  }

  /** Checks the options and the host key; player admission happens in `onJoin`. */
  override onAuth(_client: Client, rawOptions: unknown): { role: 'host' | 'player' } {
    const parsed = roomJoinOptionsSchema.safeParse(rawOptions);
    if (!parsed.success) {
      throw new JoinRefused('invalidOptions');
    }
    if (parsed.data.role === 'host') {
      if (hashSecret(parsed.data.hostKey) !== this.hostKeyHash) {
        throw new JoinRefused('wrongHostKey');
      }
      return { role: 'host' };
    }
    return { role: 'player' };
  }

  override async onJoin(client: Client, rawOptions: unknown): Promise<void> {
    const options = roomJoinOptionsSchema.parse(rawOptions);
    this.lastConnectedAtMs = this.now();
    if (options.role === 'host') {
      client.userData = { role: 'host' } satisfies RoomClientData;
      return;
    }
    const deviceKeyHash = hashSecret(options.deviceKey);
    const returning = this.liveGame.activePlayers.find(
      (player) => player.deviceKeyHash === deviceKeyHash,
    );
    if (returning) {
      this.bindPlayer(client, returning);
      await this.onPlayerResumed(returning, client);
      this.resumedSessionIds.add(client.sessionId);
      return;
    }
    const result = this.liveGame.admitPlayer({
      playerId: client.sessionId,
      nickname: options.nickname,
      deviceKeyHash,
      nowMs: this.now(),
    });
    if (!result.ok) {
      throw new JoinRefused(result.reason);
    }
    const rosterPlayer = new RosterPlayer({
      id: result.player.id,
      nickname: result.player.nickname,
    });
    this.state.players.set(result.player.id, rosterPlayer);
    this.bindPlayer(client, result.player);
    this.record({
      type: 'playerJoined',
      sessionId: this.roomId,
      playerId: result.player.id,
      nickname: result.player.nickname,
      atMs: this.now(),
    });
    await this.onPlayerAdmitted(result.player, client);
  }

  override async onDrop(client: Client): Promise<void> {
    const playerId = this.playerIdOf(client);
    if (playerId === null || this.sessionIdByPlayerId.get(playerId) !== client.sessionId) {
      return;
    }
    this.setPlayerConnected(playerId, false);
    try {
      await this.allowReconnection(client, roomServices.reconnectSeconds);
    } catch {
      // The seat expired; the player can still come back with their device key.
    }
  }

  override onReconnect(client: Client): void {
    const playerId = this.playerIdOf(client);
    this.lastConnectedAtMs = this.now();
    if (playerId === null) {
      return;
    }
    const player = this.liveGame.player(playerId);
    if (!player || player.removedAtMs !== undefined) {
      client.leave(roomCloseCodes.kicked);
      return;
    }
    if (this.sessionIdByPlayerId.get(playerId) !== client.sessionId) {
      client.leave(roomCloseCodes.replaced);
      return;
    }
    this.setPlayerConnected(playerId, true);
  }

  override onLeave(client: Client): void {
    this.resumedSessionIds.delete(client.sessionId);
    const playerId = this.playerIdOf(client);
    if (playerId !== null && this.sessionIdByPlayerId.get(playerId) === client.sessionId) {
      this.setPlayerConnected(playerId, false);
    }
  }

  override async onDispose(): Promise<void> {
    await this.releaseJoinCode();
  }

  /** Ends the game for everyone. Games call this when someone wins. */
  protected endGame(reason: GameEndReason): void {
    const event = this.liveGame.end(reason, this.now());
    if (event) {
      this.applyLifecycleEvent(event);
    }
  }

  /**
   * Turns on server-side questions and energy for players: the question, answer and energy
   * requests and spend messages of the session protocol. Question-powered games call this
   * from {@link onGameCreated}.
   */
  protected async enableQuestionSessions(rules: EnergyRules): Promise<void> {
    const questionSet = await roomServices.loadQuestionSet(this.questionSetId);
    this.questionSessions = new QuestionSessions(questionSet, rules, this.roomId, () => this.now());
    this.onMessage(sessionRequestTypes.question, (client: Client) => this.handleQuestion(client));
    this.onMessage(sessionRequestTypes.answer, (client: Client, message: unknown) =>
      this.handleAnswer(client, message),
    );
    this.onMessage(sessionRequestTypes.energy, (client: Client) => this.handleEnergy(client));
    this.onMessage(sessionMessageTypes.spend, (client: Client, message: unknown) =>
      this.handleSpend(client, message),
    );
  }

  /** The current time from the room services clock. */
  protected now(): number {
    return roomServices.now();
  }

  /** Sends an event to the session recorder, if one is configured. */
  protected record(event: Parameters<SessionRecorder['record']>[0]): void {
    void Promise.resolve(roomServices.recorder?.record(event)).catch((error: unknown) => {
      console.error('Session recorder failed', { sessionId: this.roomId, error });
    });
  }

  /** The stable player id of a connection, or `null` for host screens. */
  protected playerIdOf(client: Client): string | null {
    const data = client.userData as RoomClientData | undefined;
    return data?.role === 'player' ? data.playerId : null;
  }

  /** The live connection of a player, if they are connected. */
  protected clientOfPlayer(playerId: string): Client | undefined {
    const sessionId = this.sessionIdByPlayerId.get(playerId);
    return sessionId === undefined ? undefined : this.clients.getById(sessionId);
  }

  /** Whether a connection belongs to a host screen. */
  protected isHost(client: Client): boolean {
    return (client.userData as RoomClientData | undefined)?.role === 'host';
  }

  // Hooks for games. Each runs after the platform has applied the change.

  /** After the room is created and has its join code. */
  protected onGameCreated(_options: GameRoomCreateOptions): void | Promise<void> {}
  /** After a new player joined. */
  protected onPlayerAdmitted(_player: LivePlayer, _client: Client): void | Promise<void> {}
  /** After a known player came back on a new connection (device key). */
  protected onPlayerResumed(_player: LivePlayer, _client: Client): void | Promise<void> {}
  /** After the host removed a player. */
  protected onPlayerRemoved(_player: LivePlayer): void {}
  /** After the countdown started, play started, or the game ended. */
  protected onLifecycleEvent(_event: LiveGameEvent): void {}
  /** Every tick (4 times a second), after timers advanced. */
  protected onTick(_nowMs: number): void {}
  /** After the server applied a player's spends (some may be unpaid). */
  protected onEnergySpent(_playerId: string, _spends: readonly AppliedSpend[]): void {}
  /** After the server graded a player's answer. */
  protected onAnswered(_playerId: string, _result: AnswerResult & { ok: true }): void {}

  /** The player id of a client allowed to use questions and energy now, or a refusal. */
  private sessionPlayer(client: Client): { playerId: string } | { refusal: SessionRefusal } {
    const playerId = this.playerIdOf(client);
    const player = playerId === null ? undefined : this.liveGame.player(playerId);
    if (playerId === null || !player || player.removedAtMs !== undefined) {
      return { refusal: 'notAPlayer' };
    }
    if (!this.questionSessions) return { refusal: 'questionsUnavailable' };
    if (this.liveGame.phase !== 'playing') return { refusal: 'notPlaying' };
    return { playerId };
  }

  private handleQuestion(client: Client): PresentedQuestion {
    const found = this.sessionPlayer(client);
    if ('refusal' in found) throw new Error(found.refusal);
    return this.questionSessions!.forPlayer(found.playerId).question();
  }

  private handleAnswer(client: Client, message: unknown): AnswerReply {
    const found = this.sessionPlayer(client);
    if ('refusal' in found) throw new Error(found.refusal);
    const parsed = answerRequestSchema.safeParse(message);
    if (!parsed.success) throw new Error('invalidAnswer' satisfies SessionRefusal);
    const session = this.questionSessions!.forPlayer(found.playerId);
    const result = session.answer(parsed.data.questionId, parsed.data.chosenOptionId);
    if (!result.ok) throw new Error(result.reason);
    this.record({
      type: 'answer',
      sessionId: this.roomId,
      playerId: found.playerId,
      questionId: result.event.questionId,
      chosenOptionId: result.event.chosenOptionId,
      isCorrect: result.event.isCorrect,
      millisecondsTaken: result.event.millisecondsTaken,
      atMs: this.now(),
    });
    this.onAnswered(found.playerId, result);
    return { outcome: result.outcome, energyState: session.state };
  }

  private handleEnergy(client: Client): EnergyState {
    const playerId = this.playerIdOf(client);
    if (playerId === null || !this.questionSessions || !this.liveGame.player(playerId)) {
      throw new Error('notAPlayer' satisfies SessionRefusal);
    }
    return this.questionSessions.forPlayer(playerId).state;
  }

  private handleSpend(client: Client, message: unknown): void {
    const found = this.sessionPlayer(client);
    const parsed = spendBatchSchema.safeParse(message);
    if ('refusal' in found || !parsed.success) {
      return;
    }
    const session = this.questionSessions!.forPlayer(found.playerId);
    const applied = session.applySpends(parsed.data.firstSeq, parsed.data.reasons);
    if (applied.length === 0) return;
    this.onEnergySpent(found.playerId, applied);
    client.send(sessionMessageTypes.energyChanged, session.state);
  }

  private bindPlayer(client: Client, player: LivePlayer): void {
    const previousSessionId = this.sessionIdByPlayerId.get(player.id);
    this.sessionIdByPlayerId.set(player.id, client.sessionId);
    client.userData = { role: 'player', playerId: player.id } satisfies RoomClientData;
    this.setPlayerConnected(player.id, true);
    if (previousSessionId !== undefined && previousSessionId !== client.sessionId) {
      // An older connection of the same device (for example a stale tab) gives way.
      this.clients.getById(previousSessionId)?.leave(roomCloseCodes.replaced);
    }
  }

  private whoAmI(client: Client): WelcomeMessage | null {
    const playerId = this.playerIdOf(client);
    const player = playerId === null ? undefined : this.liveGame.player(playerId);
    if (!player) {
      return null;
    }
    return {
      playerId: player.id,
      nickname: player.nickname,
      resumed: this.resumedSessionIds.has(client.sessionId),
    };
  }

  private setPlayerConnected(playerId: string, connected: boolean): void {
    this.liveGame.setConnected(playerId, connected);
    const rosterPlayer = this.state.players.get(playerId);
    if (rosterPlayer) {
      rosterPlayer.connected = connected;
    }
  }

  private registerHostMessages(): void {
    const onHost = <Type extends keyof typeof hostMessageSchemas>(
      type: Type,
      handler: (message: z.infer<(typeof hostMessageSchemas)[Type]>) => string | null,
    ): void => {
      this.onMessage(type, (client: Client, message: unknown) => {
        if (!this.isHost(client)) {
          console.warn('Dropped host message from a non-host', { sessionId: this.roomId, type });
          return;
        }
        const parsed = hostMessageSchemas[type].safeParse(message ?? {});
        const rejection = parsed.success
          ? handler(parsed.data as z.infer<(typeof hostMessageSchemas)[Type]>)
          : 'invalidMessage';
        if (rejection !== null) {
          const reply: HostCommandRejectedMessage = { type, reason: rejection };
          client.send(serverMessageTypes.hostCommandRejected, reply);
        }
      });
    };

    onHost(hostMessageTypes.start, () => {
      const event = this.liveGame.startCountdown(this.now());
      if (!event) {
        return 'notInLobby';
      }
      this.applyLifecycleEvent(event);
      return null;
    });
    onHost(hostMessageTypes.end, () => {
      if (this.liveGame.phase === 'ended') {
        return 'alreadyEnded';
      }
      this.endGame('hostEnded');
      return null;
    });
    onHost(hostMessageTypes.lock, ({ locked }) => {
      this.liveGame.setLocked(locked);
      this.state.locked = locked;
      return null;
    });
    onHost(hostMessageTypes.addTime, ({ minutes }) => {
      return this.liveGame.addTime(minutes * 60_000) === null ? 'notPlaying' : null;
    });
    onHost(hostMessageTypes.allowKicked, () => {
      this.liveGame.allowKickedDevices();
      return null;
    });
    onHost(hostMessageTypes.rename, ({ playerId, nickname }) => {
      const rejection = this.liveGame.renamePlayer(playerId, nickname);
      if (rejection !== null) {
        return rejection;
      }
      const player = this.liveGame.player(playerId);
      const rosterPlayer = this.state.players.get(playerId);
      if (player && rosterPlayer) {
        rosterPlayer.nickname = player.nickname;
        this.record({
          type: 'playerRenamed',
          sessionId: this.roomId,
          playerId,
          nickname: player.nickname,
          atMs: this.now(),
        });
      }
      return null;
    });
    onHost(hostMessageTypes.kick, ({ playerId }) => {
      const player = this.liveGame.kickPlayer(playerId, this.now());
      if (!player) {
        return 'unknownPlayer';
      }
      const rosterPlayer = this.state.players.get(playerId);
      if (rosterPlayer) {
        rosterPlayer.removed = true;
        rosterPlayer.connected = false;
      }
      const client = this.clientOfPlayer(playerId);
      this.sessionIdByPlayerId.delete(playerId);
      if (client) {
        client.send(serverMessageTypes.kicked, {});
        client.leave(roomCloseCodes.kicked);
      }
      this.record({ type: 'playerRemoved', sessionId: this.roomId, playerId, atMs: this.now() });
      this.onPlayerRemoved(player);
      return null;
    });
  }

  private tick(): void {
    const nowMs = this.now();
    for (const event of this.liveGame.tick(nowMs)) {
      this.applyLifecycleEvent(event);
    }
    const countdownEndsAt = this.liveGame.countdownEndsAt;
    this.state.countdownRemainingMs =
      countdownEndsAt === null ? 0 : Math.max(0, countdownEndsAt - nowMs);
    const remaining = this.liveGame.remainingMs(nowMs);
    if (remaining !== null) {
      this.state.remainingMs = remaining;
    }
    this.onTick(nowMs);
    this.keepAliveOrClose(nowMs);
  }

  private keepAliveOrClose(nowMs: number): void {
    if (this.clients.length > 0) {
      this.lastConnectedAtMs = nowMs;
    }
    if (
      !this.joinCodeReleased &&
      nowMs - this.joinCodeRefreshedAtMs > (joinCodeTtlSeconds * 1000) / 3
    ) {
      this.joinCodeRefreshedAtMs = nowMs;
      void this.joinCodes.refresh(this.joinCode, joinCodeTtlSeconds);
    }
    const endedAt = this.liveGame.endedAt;
    if (endedAt !== null && nowMs - endedAt > endedRoomLingerMs) {
      void this.disconnect(roomCloseCodes.gameDisposed);
      return;
    }
    if (nowMs - this.lastConnectedAtMs > abandonedAfterMs) {
      this.endGame('abandoned');
      void this.disconnect(roomCloseCodes.gameDisposed);
    }
  }

  /** Frees the join code once; a later call must not free a code another game has claimed since. */
  private async releaseJoinCode(): Promise<void> {
    if (!this.joinCode || this.joinCodeReleased) {
      return;
    }
    this.joinCodeReleased = true;
    await this.joinCodes.release(this.joinCode);
  }

  private applyLifecycleEvent(event: LiveGameEvent): void {
    this.state.phase = this.liveGame.phase;
    if (event.type === 'ended') {
      this.state.endReason = event.reason;
      this.state.countdownRemainingMs = 0;
      this.state.remainingMs = this.liveGame.remainingMs(event.endedAtMs) ?? 0;
      // A finished game's code is free for others at once.
      void this.releaseJoinCode();
      this.record({
        type: 'sessionEnded',
        sessionId: this.roomId,
        reason: event.reason,
        atMs: event.endedAtMs,
      });
    }
    if (event.type === 'started') {
      this.state.remainingMs = event.endsAtMs - event.startedAtMs;
    }
    this.onLifecycleEvent(event);
  }
}
