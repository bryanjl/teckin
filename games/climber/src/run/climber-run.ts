import type { EnergySpendReason } from '@teckin/game-contracts';
import {
  CourseProgress,
  createPlatformerBody,
  footOf,
  stepPlatformer,
  type PlatformerBody,
  type PlatformerEvent,
} from '@teckin/platformer-kit';
import type { ClimberCourse } from '../course/course';
import type { ClimberTunables } from '../tunables';
import { energyLimits } from './energy-rules';

/** Where a run's energy comes from: the game session (local now, networked in Phase 3). */
export interface EnergyAccount {
  readonly energy: number;
  spendEnergy(amount: number, reason: EnergySpendReason): boolean;
}

/** Buttons held for one simulation step. */
export interface RunInput {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  /** Jump went down since the previous step. */
  jumpPressed: boolean;
}

/** What happened in one {@link ClimberRun.step}. */
export interface RunStepResult {
  events: PlatformerEvent[];
  /** Index of a summit reached in this step. */
  reachedSummit?: number;
  /** True in the step that reached the last summit. */
  finished: boolean;
}

/**
 * One player's climb, free of Phaser: the body moved by the platformer kit, summit progress,
 * checkpoints, the clock, and energy (jumps and walking spend it, an empty meter crawls).
 * The scene draws it; tests and the playtest bot run it directly at full speed.
 */
export class ClimberRun {
  body: PlatformerBody;
  /** The body one step ago, for interpolated drawing. */
  previousBody: PlatformerBody;
  readonly progress: CourseProgress;
  elapsedSeconds = 0;
  completed = false;
  /** 0 on the ground, 1 after a jump, 2 after the double jump. */
  jumpsUsed = 0;
  private walkedPixels = 0;

  constructor(
    readonly course: ClimberCourse,
    readonly tunables: ClimberTunables,
    private readonly energy: EnergyAccount,
    checkpointsEnabled: boolean,
  ) {
    this.body = this.spawnBody(course.spawn.x, course.spawn.y);
    this.previousBody = this.body;
    this.progress = new CourseProgress(course.summits, checkpointsEnabled);
  }

  /** Feet position, world pixels. */
  get foot(): { x: number; y: number } {
    return footOf(this.body, this.tunables.physics);
  }

  /** Height of the feet in metres on the course scale. */
  get heightMetres(): number {
    return Math.max(0, this.course.heightAt(this.foot.y));
  }

  /** True at zero energy, when the player crawls. */
  get crawling(): boolean {
    return this.energy.energy <= 0;
  }

  /** Advances one fixed step. Does nothing once the course is complete. */
  step(input: RunInput): RunStepResult {
    if (this.completed) return { events: [], finished: false };
    const { physics } = this.tunables;
    const limits = energyLimits(this.energy.energy, this.tunables);
    this.previousBody = this.body;
    const result = stepPlatformer(
      this.body,
      {
        left: input.left,
        right: input.right,
        jumpHeld: input.jumpHeld,
        jumpPressed: input.jumpPressed,
        groundJumpAllowed: limits.groundJumpAllowed,
        airJumpAllowed: limits.airJumpAllowed,
        speedScale: limits.speedScale,
      },
      this.course.map.grid,
      physics,
      physics.fixedStep,
    );
    this.body = result.body;
    this.elapsedSeconds += physics.fixedStep;

    for (const event of result.events) {
      if (event === 'jump') {
        this.jumpsUsed = 1;
        this.energy.spendEnergy(this.tunables.jumpCost, 'jump');
      }
      if (event === 'airJump') {
        this.jumpsUsed += 1;
        this.energy.spendEnergy(this.tunables.doubleJumpCost, 'airJump');
      }
      if (event === 'land') this.jumpsUsed = 0;
    }
    this.chargeWalking(limits.crawling, Math.abs(this.body.x - this.previousBody.x));

    const update = this.progress.update(
      { x: this.body.x, y: this.body.y, width: physics.bodyWidth, height: physics.bodyHeight },
      this.body.onGround,
    );
    const finished = update.finished && !this.completed;
    if (finished) this.completed = true;
    return {
      events: result.events,
      ...(update.reachedGoal !== undefined ? { reachedSummit: update.reachedGoal } : {}),
      finished,
    };
  }

  /** Back to the start with summits and the clock reset (energy is the session's job). */
  restart(): void {
    this.placeAt(this.course.spawn.x, this.course.spawn.y);
    this.progress.reset();
    this.elapsedSeconds = 0;
    this.completed = false;
  }

  /** Moves the player to the saved checkpoint, if there is one. Returns whether it did. */
  respawnAtCheckpoint(): boolean {
    const checkpoint = this.progress.checkpoint;
    if (!checkpoint) return false;
    this.placeAt(checkpoint.respawnX, checkpoint.respawnY);
    return true;
  }

  /** Puts the player at the start keeping summits and time, as after a long fall. */
  dropToStart(): void {
    this.placeAt(this.course.spawn.x, this.course.spawn.y);
  }

  private placeAt(footX: number, footY: number): void {
    this.body = this.spawnBody(footX, footY);
    this.previousBody = this.body;
    this.jumpsUsed = 0;
    this.walkedPixels = 0;
  }

  private spawnBody(footX: number, footY: number): PlatformerBody {
    return createPlatformerBody(footX, footY, this.tunables.physics);
  }

  /** Walking costs `walkingCostPerTile` per whole tile moved sideways; crawling is free. */
  private chargeWalking(crawling: boolean, movedPixels: number): void {
    if (crawling) {
      this.walkedPixels = 0;
      return;
    }
    const tile = this.tunables.physics.tileSize;
    this.walkedPixels += movedPixels;
    while (this.walkedPixels >= tile) {
      this.walkedPixels -= tile;
      if (!this.energy.spendEnergy(this.tunables.walkingCostPerTile, 'walk')) {
        // Fewer than one tile's worth left: spend the rest so the meter reaches zero.
        const rest = this.energy.energy;
        if (rest > 0) this.energy.spendEnergy(rest, 'walk');
      }
    }
  }
}
