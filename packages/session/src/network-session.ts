import {
  sessionMessageTypes,
  sessionRequestTypes,
  type AnswerOutcome,
  type AnswerReply,
  type AnswerSummary,
  type EnergyChange,
  type EnergySpendReason,
  type EnergyState,
  type GameSession,
  type MissedQuestion,
  type PresentedQuestion,
  type ProgressEvent,
  type RealtimeChannel,
  type SpendBatch,
} from '@teckin/game-contracts';

/**
 * The parts of a joined room a {@link NetworkSession} uses. A Colyseus SDK `Room` has all of
 * them; tests can pass a fake.
 */
export interface RoomConnection {
  send(type: string, payload?: unknown): void;
  request(type: string, payload?: unknown): Promise<unknown>;
  /** Listens for a message; returns an unsubscribe function. */
  onMessage(type: string, listener: (payload: unknown) => void): () => void;
}

/** Options for {@link NetworkSession}. */
export interface NetworkSessionOptions {
  connection: RoomConnection;
  /** This player's stable id in the room. */
  playerId: string;
  /** The server's energy for this player when the session starts. */
  initialEnergy: EnergyState;
  /** How long spends wait to be batched when no game message carries them sooner. */
  flushDelayMs?: number;
}

interface PendingSpend {
  seq: number;
  reason: string;
  amount: number;
}

const maxSpendsPerBatch = 64;

/**
 * A {@link GameSession} backed by a multiplayer room. The server picks questions, grades
 * answers and keeps the energy balance; this session predicts spending so movement answers
 * at once, sends each spend (numbered, so a resend after a reconnect is charged once) and
 * reconciles with every {@link EnergyState} the server reports:
 * predicted energy = server energy − spends the server has not applied yet.
 */
export class NetworkSession implements GameSession {
  readonly realtime: RealtimeChannel;
  private serverState: EnergyState;
  private predicted: number;
  private readonly pending: PendingSpend[] = [];
  private nextSeq: number;
  /** Highest spend sequence already sent (sent but unapplied spends are still pending). */
  private sentUpTo: number;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly flushDelayMs: number;
  private readonly listeners = new Set<(change: EnergyChange) => void>();
  private readonly unsubscribes: (() => void)[] = [];
  private readonly prompts = new Map<string, string>();
  private readonly outcomes: AnswerOutcome[] = [];
  private readonly progressLog: ProgressEvent[] = [];

  constructor(private readonly options: NetworkSessionOptions) {
    const { connection } = options;
    this.serverState = options.initialEnergy;
    this.predicted = options.initialEnergy.energy;
    this.nextSeq = options.initialEnergy.spendSeq + 1;
    this.sentUpTo = options.initialEnergy.spendSeq;
    this.flushDelayMs = options.flushDelayMs ?? 100;
    this.unsubscribes.push(
      connection.onMessage(sessionMessageTypes.energyChanged, (payload) =>
        this.applyServerState(payload as EnergyState, 'sync'),
      ),
    );
    this.realtime = {
      playerId: options.playerId,
      send: (type, payload) => {
        this.flush();
        connection.send(type, payload);
      },
      request: async <Reply>(type: string, payload?: unknown) => {
        this.flush();
        return (await connection.request(type, payload)) as Reply;
      },
      onMessage: (type, listener) => connection.onMessage(type, listener),
    };
  }

  /** Joins the session to a room: asks the server for this player's energy first. */
  static async connect(
    connection: RoomConnection,
    playerId: string,
    options: Pick<NetworkSessionOptions, 'flushDelayMs'> = {},
  ): Promise<NetworkSession> {
    const initialEnergy = (await connection.request(sessionRequestTypes.energy)) as EnergyState;
    return new NetworkSession({ connection, playerId, initialEnergy, ...options });
  }

  get energy(): number {
    return this.predicted;
  }

  /** Spends the device has predicted that the server has not applied yet. */
  get unconfirmedSpends(): number {
    return this.pending.length;
  }

  async currentQuestion(): Promise<PresentedQuestion> {
    const question = (await this.options.connection.request(
      sessionRequestTypes.question,
    )) as PresentedQuestion;
    this.prompts.set(question.id, question.prompt);
    return question;
  }

  async submitAnswer(questionId: string, chosenOptionId: string): Promise<AnswerOutcome> {
    // Spends made before answering reach the server first, so the reply accounts for them.
    this.flush();
    const reply = (await this.options.connection.request(sessionRequestTypes.answer, {
      questionId,
      chosenOptionId,
    })) as AnswerReply;
    this.applyServerState(reply.energyState, 'answer');
    const outcome: AnswerOutcome = { ...reply.outcome, energy: this.predicted };
    this.outcomes.push(outcome);
    return outcome;
  }

  spendEnergy(amount: number, reason: EnergySpendReason): boolean {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Cannot spend ${amount} energy`);
    if (amount === 0) return true;
    if (amount > this.predicted) return false;
    this.pending.push({ seq: this.nextSeq, reason, amount });
    this.nextSeq += 1;
    this.emit(-amount, reason);
    this.scheduleFlush();
    return true;
  }

  /** Progress is worked out by the room from validated movement; this keeps a local log only. */
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
    const answered = this.outcomes.length;
    const correct = this.outcomes.filter((outcome) => outcome.isCorrect).length;
    const missed = new Map<string, MissedQuestion>();
    for (const outcome of this.outcomes) {
      if (outcome.isCorrect) continue;
      const existing = missed.get(outcome.questionId);
      if (existing) {
        existing.timesMissed += 1;
        continue;
      }
      missed.set(outcome.questionId, {
        questionId: outcome.questionId,
        prompt: this.prompts.get(outcome.questionId) ?? '',
        correctAnswer: outcome.correctAnswerText,
        timesMissed: 1,
      });
    }
    return {
      answered,
      correct,
      accuracy: answered === 0 ? 0 : correct / answered,
      missed: [...missed.values()],
    };
  }

  /** A networked game is never restarted from the device; the room owns the game. */
  reset(): void {}

  /** Sends every spend not sent yet. Game messages call this first automatically. */
  flush(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    const unsent = this.pending.filter((spend) => spend.seq > this.sentUpTo);
    for (let start = 0; start < unsent.length; start += maxSpendsPerBatch) {
      const chunk = unsent.slice(start, start + maxSpendsPerBatch);
      const batch: SpendBatch = {
        firstSeq: chunk[0]!.seq,
        reasons: chunk.map((spend) => spend.reason),
      };
      this.options.connection.send(sessionMessageTypes.spend, batch);
      this.sentUpTo = chunk[chunk.length - 1]!.seq;
    }
  }

  /**
   * After a reconnect: asks for the server's energy, then resends every spend it has not
   * applied (it skips any it already had), so nothing sent into a dropped connection is lost.
   */
  async resync(): Promise<void> {
    const state = (await this.options.connection.request(
      sessionRequestTypes.energy,
    )) as EnergyState;
    this.applyServerState(state, 'sync');
    this.sentUpTo = Math.min(this.sentUpTo, state.spendSeq);
    this.flush();
  }

  /** Stops listening and sends anything still waiting. */
  dispose(): void {
    this.flush();
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes.length = 0;
    this.listeners.clear();
  }

  private applyServerState(state: EnergyState, reason: EnergyChange['reason']): void {
    // Versions only grow; an equal version is the state already applied.
    if (state.version <= this.serverState.version) return;
    this.serverState = state;
    while (this.pending.length > 0 && this.pending[0]!.seq <= state.spendSeq) this.pending.shift();
    const unapplied = this.pending.reduce((total, spend) => total + spend.amount, 0);
    const next = Math.max(0, state.energy - unapplied);
    this.emit(next - this.predicted, reason);
  }

  private emit(delta: number, reason: EnergyChange['reason']): void {
    if (delta === 0) return;
    this.predicted = Math.max(0, this.predicted + delta);
    const change: EnergyChange = { energy: this.predicted, delta, reason };
    for (const listener of this.listeners) listener(change);
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, this.flushDelayMs);
  }
}
