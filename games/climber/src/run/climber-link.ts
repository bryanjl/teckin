import type { RealtimeChannel } from '@teckin/game-contracts';
import {
  climberClientMessageTypes,
  climberRequestTypes,
  climberServerMessageTypes,
  type ClimberPlacement,
  type Correction,
  type MoveReport,
} from '../protocol';
import type { ClimberRun } from './climber-run';

/** Options for {@link ClimberLink}. */
export interface ClimberLinkOptions {
  /** Seconds of play between position reports (spec: about 10 a second). */
  reportIntervalSeconds?: number;
  /** Called after the room moved the player back. */
  onCorrection?: (correction: Correction) => void;
}

/**
 * Connects one player's {@link ClimberRun} to the Climber room: reports where the feet are
 * about ten times a second of play, tells the room about checkpoint respawns, and puts the
 * player back when the room refuses a position. Free of Phaser, so the browser game and the
 * headless test and load-test bots share it.
 */
export class ClimberLink {
  private seq = 0;
  private correctionId = 0;
  private sinceReport = 0;
  private readonly intervalSeconds: number;
  private readonly unsubscribe: () => void;
  private correctionCount = 0;

  constructor(
    private readonly run: ClimberRun,
    private readonly channel: RealtimeChannel,
    private readonly options: ClimberLinkOptions = {},
  ) {
    this.intervalSeconds = options.reportIntervalSeconds ?? 0.1;
    this.unsubscribe = channel.onMessage(climberServerMessageTypes.correction, (payload) =>
      this.applyCorrection(payload as Correction),
    );
  }

  /** How many times the room has moved this player back. */
  get corrections(): number {
    return this.correctionCount;
  }

  /**
   * Asks the room where it has the player and puts the run there: used when a device joins
   * or rejoins a game in progress, so height and summits carry over.
   */
  async restore(): Promise<ClimberPlacement> {
    const placement = await this.channel.request<ClimberPlacement>(climberRequestTypes.placement);
    this.correctionId = Math.max(this.correctionId, placement.correctionId);
    this.run.placeAt(placement.x, placement.y);
    this.run.progress.restore(placement.summitsReached, placement.y);
    return placement;
  }

  /** Call after each simulation step; sends a report whenever a report interval has passed. */
  afterStep(stepSeconds: number): void {
    this.sinceReport += stepSeconds;
    if (this.sinceReport + 1e-9 < this.intervalSeconds) return;
    this.sinceReport = 0;
    this.report();
  }

  /** Sends the current position now. */
  report(): void {
    this.seq += 1;
    const foot = this.run.foot;
    const report: MoveReport = {
      seq: this.seq,
      x: foot.x,
      y: foot.y,
      onGround: this.run.body.onGround,
      summits: this.run.progress.goalsReached,
      correctionId: this.correctionId,
    };
    this.channel.send(climberClientMessageTypes.move, report);
  }

  /** Tells the room the player used "Back to checkpoint" (after the run moved there). */
  reportRespawn(): void {
    this.channel.send(climberClientMessageTypes.respawn, {});
  }

  dispose(): void {
    this.unsubscribe();
  }

  private applyCorrection(correction: Correction): void {
    if (correction.correctionId <= this.correctionId) return;
    this.correctionId = correction.correctionId;
    this.correctionCount += 1;
    this.run.placeAt(correction.x, correction.y);
    this.sinceReport = 0;
    this.options.onCorrection?.(correction);
  }
}
