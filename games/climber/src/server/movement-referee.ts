import type { Box, CollisionGrid } from '@teckin/platformer-kit';
import type { ClimberCourse } from '../course/course';
import type { ClimberTunables } from '../tunables';

/** Limits the referee holds reported movement to, worked out from the course and physics. */
export interface MovementLimits {
  /** Highest rise of the feet from one ground jump, pixels. */
  groundJumpRise: number;
  /** Highest rise from one air (double) jump, pixels. */
  airJumpRise: number;
  /** Slack added to each jump and to any rise, for rounding and sampling, pixels. */
  riseTolerance: number;
  /** Fastest honest sideways speed: running plus a moving ledge plus a vent, with slack, px/s. */
  maxHorizontalSpeed: number;
  /** Seconds of sideways travel that may arrive in one burst (reports bunched by the network). */
  horizontalBurstSeconds: number;
  /** How far outside a summit zone a report may be and still reach it, pixels. */
  summitReach: number;
}

/** Works out {@link MovementLimits} for a course. */
export function movementLimitsFor(
  course: ClimberCourse,
  tunables: ClimberTunables,
): MovementLimits {
  const { physics } = tunables;
  const fastestLedge = Math.max(
    0,
    ...course.hazards.movingPlatforms.map(
      (platform) => (Math.abs(platform.travelX) * Math.PI) / platform.periodSeconds,
    ),
  );
  const strongestVent = Math.max(
    0,
    ...course.hazards.vents.map((vent) => Math.abs(vent.pushSpeed)),
  );
  return {
    groundJumpRise: physics.jumpVelocity ** 2 / (2 * physics.gravity),
    airJumpRise: physics.airJumpVelocity ** 2 / (2 * physics.gravity),
    riseTolerance: physics.tileSize / 4,
    maxHorizontalSpeed: (physics.runSpeed + fastestLedge + strongestVent) * 1.25,
    horizontalBurstSeconds: 0.75,
    summitReach: physics.tileSize,
  };
}

/** Why a reported position was refused. */
export type MoveRejection = 'outsideCourse' | 'insideWall' | 'tooFast' | 'tooHigh';

/** The referee's ruling on one report. */
export type MoveVerdict =
  | { accepted: true; reachedSummit?: number; finished: boolean }
  | { accepted: false; reason: MoveRejection };

/** What the referee needs from a report. */
export interface ReportedMove {
  /** Feet, world pixels. */
  x: number;
  y: number;
  onGround: boolean;
  /** Summits the device counts as reached. */
  summits: number;
}

/**
 * Checks one player's reported movement on the server. Physics runs on the device; the
 * referee only accepts positions an honest device could reach:
 *
 * - inside the course and never inside a wall;
 * - no faster sideways than running on a moving ledge in a vent (with a burst allowance for
 *   reports the network bunches together);
 * - no higher than the jumps the player paid for: each paid ground or air jump adds its
 *   highest possible rise, and standing on a ledge without a new jump clears what is left;
 * - summits only in order, and only where the player actually is.
 *
 * A refused report changes nothing; the room sends the player back to the last accepted
 * position. Hazard timing is not replayed on the server (see docs/DECISIONS.md).
 */
export class MovementReferee {
  private footX: number;
  private footY: number;
  private reached = 0;
  private riseAllowance = 0;
  private jumpsSinceReview = 0;
  private horizontalBudget: number;
  private lastReviewMs: number;

  constructor(
    private readonly course: ClimberCourse,
    private readonly tunables: ClimberTunables,
    private readonly limits: MovementLimits,
    /** Walls that never change: the course grid without crumbling ledges. */
    private readonly walls: CollisionGrid,
    nowMs: number,
  ) {
    this.footX = course.spawn.x;
    this.footY = course.spawn.y;
    this.horizontalBudget = this.maxHorizontalBudget;
    this.lastReviewMs = nowMs;
  }

  /** Last accepted position of the feet. */
  get foot(): { x: number; y: number } {
    return { x: this.footX, y: this.footY };
  }

  get summitsReached(): number {
    return this.reached;
  }

  get finished(): boolean {
    return this.reached >= this.course.summits.length;
  }

  /** Height of the last accepted position, metres. */
  get heightMetres(): number {
    return Math.max(0, this.course.heightAt(this.footY));
  }

  /** Records a jump the server charged for, which allows that much more rise. */
  payJump(kind: 'jump' | 'airJump'): void {
    this.riseAllowance +=
      (kind === 'jump' ? this.limits.groundJumpRise : this.limits.airJumpRise) +
      this.limits.riseTolerance;
    this.jumpsSinceReview += 1;
  }

  /** Rules on a report received at `nowMs`; accepted reports become the new position. */
  review(report: ReportedMove, nowMs: number): MoveVerdict {
    const elapsedSeconds = Math.max(0, nowMs - this.lastReviewMs) / 1000;
    this.lastReviewMs = Math.max(this.lastReviewMs, nowMs);
    this.horizontalBudget = Math.min(
      this.maxHorizontalBudget,
      this.horizontalBudget + this.limits.maxHorizontalSpeed * elapsedSeconds,
    );
    const jumped = this.jumpsSinceReview > 0;
    this.jumpsSinceReview = 0;

    if (!this.insideCourse(report)) return { accepted: false, reason: 'outsideCourse' };
    if (this.overlapsWall(report)) return { accepted: false, reason: 'insideWall' };
    const sideways = Math.abs(report.x - this.footX);
    if (sideways > this.horizontalBudget) return { accepted: false, reason: 'tooFast' };
    const rise = this.footY - report.y;
    if (rise > this.limits.riseTolerance && rise > this.riseAllowance + this.limits.riseTolerance) {
      return { accepted: false, reason: 'tooHigh' };
    }

    this.horizontalBudget -= sideways;
    if (rise > 0) this.riseAllowance = Math.max(0, this.riseAllowance - rise);
    if (report.onGround && !jumped) this.riseAllowance = 0;
    this.footX = report.x;
    this.footY = report.y;

    const summit = this.course.summits[this.reached];
    if (
      summit &&
      (report.onGround || report.summits > this.reached) &&
      overlaps(this.box(report), expand(summit, this.limits.summitReach))
    ) {
      this.reached += 1;
      return { accepted: true, reachedSummit: this.reached - 1, finished: this.finished };
    }
    return { accepted: true, finished: false };
  }

  /**
   * Moves the player to their checkpoint (the last summit reached) when checkpoints are on.
   * Returns the new feet position, or `null` when there is no checkpoint.
   */
  respawnAtCheckpoint(checkpointsEnabled: boolean, nowMs: number): { x: number; y: number } | null {
    const summit = this.course.summits[this.reached - 1];
    if (!checkpointsEnabled || !summit || this.finished) return null;
    this.placeAt(summit.respawnX, summit.respawnY, nowMs);
    return this.foot;
  }

  /** After a correction: the device restarts from the accepted position with no rise left. */
  forgetRise(): void {
    this.riseAllowance = 0;
    this.jumpsSinceReview = 0;
  }

  private placeAt(x: number, y: number, nowMs: number): void {
    this.footX = x;
    this.footY = y;
    this.forgetRise();
    this.lastReviewMs = Math.max(this.lastReviewMs, nowMs);
  }

  private get maxHorizontalBudget(): number {
    return this.limits.maxHorizontalSpeed * this.limits.horizontalBurstSeconds;
  }

  private insideCourse(report: ReportedMove): boolean {
    const margin = this.tunables.physics.tileSize * 2;
    return (
      report.x >= 0 &&
      report.x <= this.walls.width &&
      report.y >= -margin &&
      report.y <= this.walls.height + margin
    );
  }

  private box(report: ReportedMove): Box {
    const { bodyWidth, bodyHeight } = this.tunables.physics;
    return {
      x: report.x - bodyWidth / 2,
      y: report.y - bodyHeight,
      width: bodyWidth,
      height: bodyHeight,
    };
  }

  /** True when the body, shrunk by a small margin, overlaps a solid tile. */
  private overlapsWall(report: ReportedMove): boolean {
    const inset = 2;
    const box = this.box(report);
    const size = this.walls.tileSize;
    const firstColumn = Math.floor((box.x + inset) / size);
    const lastColumn = Math.floor((box.x + box.width - inset) / size);
    const firstRow = Math.floor((box.y + inset) / size);
    const lastRow = Math.floor((box.y + box.height - inset) / size);
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (this.walls.at(column, row) === 'solid') return true;
      }
    }
    return false;
  }
}

/**
 * The course's collision grid without its crumbling ledges: what never changes, so a
 * player who fell through a crumbled ledge is never mistaken for being inside a wall.
 */
export function permanentWalls(course: ClimberCourse): CollisionGrid {
  const walls = course.map.grid.clone();
  for (const ledge of course.hazards.crumblingLedges) {
    for (let column = ledge.fromColumn; column <= ledge.toColumn; column += 1) {
      walls.set(column, ledge.row, 'empty');
    }
  }
  return walls;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function expand(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}
