import type { Client } from '@colyseus/core';
import { schema, t, type SchemaType } from '@colyseus/schema';
import {
  BaseGameRoom,
  RoomStateBase,
  type AnswerResult,
  type AppliedSpend,
  type GameRoomCreateOptions,
  type LiveGameEvent,
  type LivePlayer,
} from '@teckin/room-core';
import { bundledCourseMap, createClimberCourse, type ClimberCourse } from '../course/course';
import {
  climberClientMessageTypes,
  climberRequestTypes,
  climberServerMessageTypes,
  moveReportSchema,
  type ClimberPlacement,
} from '../protocol';
import { climberSettingsSchema, type ClimberSettings } from '../settings';
import { defaultClimberTunables, type ClimberTunables } from '../tunables';
import {
  MovementReferee,
  movementLimitsFor,
  permanentWalls,
  type MovementLimits,
} from './movement-referee';
import { rankClimbers } from './ranking';

/** One climber as every screen sees them: position, height, summits, rank and answers. */
export const ClimberProgress = schema(
  {
    /** Feet, world pixels (for drawing other players). */
    x: t.float32().default(0),
    y: t.float32().default(0),
    heightMetres: t.uint16().default(0),
    bestHeightMetres: t.uint16().default(0),
    summitsReached: t.uint8().default(0),
    finished: t.boolean().default(false),
    /** Live rank from 1; frozen when the game ends. */
    rank: t.uint16().default(0),
    answered: t.uint16().default(0),
    correct: t.uint16().default(0),
  },
  'ClimberProgress',
);
export type ClimberProgress = SchemaType<typeof ClimberProgress>;

/** The Climber room's synchronised state: the shared room state plus every climber. */
export const ClimberRoomState = RoomStateBase.extend(
  {
    /** Climbers by player id; removed players leave this map. */
    climbers: t.map(ClimberProgress),
    /** Number of summits on the course. */
    summitCount: t.uint8().default(0),
    /** Player id of the winner, once the game has ended with any players. */
    winnerId: t.string().default(''),
    /** The host's checkpoints setting, so devices offer "Back to checkpoint" only when on. */
    checkpointsEnabled: t.boolean().default(false),
  },
  'ClimberRoomState',
);
export type ClimberRoomState = SchemaType<typeof ClimberRoomState>;

/** Server-only facts about one climber. */
interface ClimberRecord {
  referee: MovementReferee;
  bestHeightMetres: number;
  bestHeightAtMs: number;
  finishedAtMs: number | null;
  joinedAtMs: number;
  /** Increases with every correction; reports from before the latest are ignored. */
  correctionId: number;
  lastReportSeq: number;
}

/**
 * The Climber game's room. The platform's base room handles the lobby, lifecycle, timer,
 * reconnects, kicks and the server-side questions and energy; this room adds what is
 * particular to the climb:
 *
 * - prices for jumps, double jumps and walking, and a rise allowance for each paid jump;
 * - position reports checked by a {@link MovementReferee}, with impossible ones snapped back;
 * - summits in order, height, best height and a live ranking in the shared state;
 * - the win: the first player to the top ends the game; otherwise the highest player wins.
 */
export class ClimberRoom extends BaseGameRoom<ClimberRoomState> {
  private settings!: ClimberSettings;
  private tunables: ClimberTunables = defaultClimberTunables;
  private course!: ClimberCourse;
  private limits!: MovementLimits;
  private walls!: ReturnType<typeof permanentWalls>;
  private readonly records = new Map<string, ClimberRecord>();

  protected override createState(): ClimberRoomState {
    return new ClimberRoomState();
  }

  protected override async onGameCreated(options: GameRoomCreateOptions): Promise<void> {
    this.settings = climberSettingsSchema.parse(options.gameSettings ?? {});
    this.course = createClimberCourse(bundledCourseMap, this.tunables);
    this.limits = movementLimitsFor(this.course, this.tunables);
    this.walls = permanentWalls(this.course);
    this.state.summitCount = this.course.summits.length;
    this.state.checkpointsEnabled = this.settings.checkpointsEnabled;
    const prices: Record<string, number> = {
      jump: this.tunables.jumpCost,
      airJump: this.tunables.doubleJumpCost,
      walk: this.tunables.walkingCostPerTile,
    };
    await this.enableQuestionSessions({
      startingEnergy: this.tunables.startingEnergy,
      energyPerCorrectAnswer: this.settings.energyPerCorrectAnswer,
      costOf: (reason) => prices[reason],
    });
    this.onMessage(climberClientMessageTypes.move, (client: Client, message: unknown) =>
      this.handleMove(client, message),
    );
    this.onMessage(climberClientMessageTypes.respawn, (client: Client) =>
      this.handleRespawn(client),
    );
    this.onMessage(climberRequestTypes.placement, (client: Client) => this.placementOf(client));
  }

  protected override onPlayerAdmitted(player: LivePlayer): void {
    const referee = new MovementReferee(
      this.course,
      this.tunables,
      this.limits,
      this.walls,
      this.now(),
    );
    this.records.set(player.id, {
      referee,
      bestHeightMetres: 0,
      bestHeightAtMs: this.now(),
      finishedAtMs: null,
      joinedAtMs: player.joinedAtMs,
      correctionId: 0,
      lastReportSeq: -1,
    });
    const progress = new ClimberProgress();
    progress.x = referee.foot.x;
    progress.y = referee.foot.y;
    progress.rank = this.records.size;
    this.state.climbers.set(player.id, progress);
  }

  /**
   * A device came back with its device key (a reload or a discarded tab): its new page numbers
   * reports from 1 again, so forget the old sequence or every report would look stale.
   */
  protected override onPlayerResumed(player: LivePlayer): void {
    const record = this.records.get(player.id);
    if (record) record.lastReportSeq = -1;
  }

  protected override onPlayerRemoved(player: LivePlayer): void {
    this.records.delete(player.id);
    this.state.climbers.delete(player.id);
  }

  protected override onEnergySpent(playerId: string, spends: readonly AppliedSpend[]): void {
    const record = this.records.get(playerId);
    if (!record) return;
    for (const spend of spends) {
      if (spend.paid && (spend.reason === 'jump' || spend.reason === 'airJump')) {
        record.referee.payJump(spend.reason);
      }
    }
  }

  protected override onAnswered(playerId: string, result: AnswerResult & { ok: true }): void {
    const progress = this.state.climbers.get(playerId);
    if (!progress) return;
    progress.answered += 1;
    if (result.event.isCorrect) progress.correct += 1;
  }

  protected override onTick(): void {
    if (this.liveGame.phase === 'playing') this.updateRanks();
  }

  protected override onLifecycleEvent(event: LiveGameEvent): void {
    if (event.type !== 'ended') return;
    const ranking = this.updateRanks();
    this.state.winnerId = ranking[0]?.playerId ?? '';
    for (const { playerId, rank } of ranking) {
      const progress = this.state.climbers.get(playerId);
      if (!progress) continue;
      this.record({
        type: 'result',
        sessionId: this.roomId,
        playerId,
        rank,
        stats: {
          bestHeightMetres: progress.bestHeightMetres,
          summitsReached: progress.summitsReached,
          finished: progress.finished ? 1 : 0,
          answered: progress.answered,
          correct: progress.correct,
        },
        atMs: event.endedAtMs,
      });
    }
  }

  /** Ranks every climber still in the game and writes the ranks into the state. */
  private updateRanks(): { playerId: string; rank: number }[] {
    const ranking = rankClimbers(
      [...this.records.entries()].map(([playerId, record]) => ({
        playerId,
        heightMetres: record.referee.heightMetres,
        bestHeightMetres: record.bestHeightMetres,
        bestHeightAtMs: record.bestHeightAtMs,
        finishedAtMs: record.finishedAtMs,
        joinedAtMs: record.joinedAtMs,
      })),
    );
    for (const { playerId, rank } of ranking) {
      const progress = this.state.climbers.get(playerId);
      if (progress && progress.rank !== rank) progress.rank = rank;
    }
    return ranking;
  }

  private handleMove(client: Client, message: unknown): void {
    const playerId = this.playerIdOf(client);
    const record = playerId === null ? undefined : this.records.get(playerId);
    const progress = playerId === null ? undefined : this.state.climbers.get(playerId);
    const parsed = moveReportSchema.safeParse(message);
    if (
      playerId === null ||
      !record ||
      !progress ||
      !parsed.success ||
      this.liveGame.phase !== 'playing' ||
      record.finishedAtMs !== null
    ) {
      return;
    }
    const report = parsed.data;
    // Sent before the device applied the latest correction, or out of date: nothing to rule on.
    if (report.correctionId < record.correctionId || report.seq <= record.lastReportSeq) return;
    record.lastReportSeq = report.seq;

    const nowMs = this.now();
    const verdict = record.referee.review(report, nowMs);
    if (!verdict.accepted) {
      this.correct(client, record);
      return;
    }
    this.applyPosition(record, progress, nowMs);
    if (verdict.reachedSummit !== undefined) {
      progress.summitsReached = record.referee.summitsReached;
      this.record({
        type: 'progress',
        sessionId: this.roomId,
        playerId,
        details: { summit: verdict.reachedSummit + 1, metres: progress.heightMetres },
        atMs: nowMs,
      });
    }
    if (verdict.finished) {
      record.finishedAtMs = nowMs;
      progress.finished = true;
      this.endGame('goalReached');
    }
  }

  private handleRespawn(client: Client): void {
    const playerId = this.playerIdOf(client);
    const record = playerId === null ? undefined : this.records.get(playerId);
    const progress = playerId === null ? undefined : this.state.climbers.get(playerId);
    if (!record || !progress || this.liveGame.phase !== 'playing') return;
    const nowMs = this.now();
    if (record.referee.respawnAtCheckpoint(this.settings.checkpointsEnabled, nowMs)) {
      this.applyPosition(record, progress, nowMs);
    } else {
      this.correct(client, record);
    }
  }

  private applyPosition(record: ClimberRecord, progress: ClimberProgress, nowMs: number): void {
    const { x, y } = record.referee.foot;
    progress.x = x;
    progress.y = y;
    const height = Math.round(record.referee.heightMetres);
    progress.heightMetres = height;
    if (height > record.bestHeightMetres) {
      record.bestHeightMetres = height;
      record.bestHeightAtMs = nowMs;
      progress.bestHeightMetres = height;
    }
  }

  /** Sends the player back to the last accepted position. */
  private correct(client: Client, record: ClimberRecord): void {
    record.correctionId += 1;
    record.referee.forgetRise();
    client.send(climberServerMessageTypes.correction, this.placement(record));
  }

  private placementOf(client: Client): ClimberPlacement {
    const playerId = this.playerIdOf(client);
    const record = playerId === null ? undefined : this.records.get(playerId);
    if (!record) throw new Error('notAPlayer');
    return this.placement(record);
  }

  private placement(record: ClimberRecord): ClimberPlacement {
    return {
      ...record.referee.foot,
      summitsReached: record.referee.summitsReached,
      finished: record.finishedAtMs !== null,
      correctionId: record.correctionId,
    };
  }
}
