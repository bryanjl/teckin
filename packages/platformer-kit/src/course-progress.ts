import type { Box } from './collision-grid';

/** A point on a course with the value it maps to, e.g. a y position and its height in metres. */
export interface HeightStop {
  /** World y in pixels (down is positive). */
  y: number;
  /** Displayed height at that y. */
  height: number;
}

/**
 * Builds a function from world y to displayed height, linear between `stops` and
 * extended past the highest stop at the last segment's rate. Below the lowest stop the
 * height stays at that stop's value, so standing under the start never shows a negative.
 * Lets each part of a course have its own scale while the total stays fixed
 * (for example six summits that always add up to 1,000 m).
 */
export function createHeightScale(stops: readonly HeightStop[]): (y: number) => number {
  if (stops.length < 2) throw new Error('A height scale needs at least two stops');
  const sorted = [...stops].sort((a, b) => b.y - a.y);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1] as HeightStop;
    const current = sorted[index] as HeightStop;
    if (current.y === previous.y || current.height <= previous.height) {
      throw new Error('Height stops must rise strictly as y decreases');
    }
  }
  const lowest = sorted[0] as HeightStop;
  return (y) => {
    if (y >= lowest.y) return lowest.height;
    for (let index = 1; index < sorted.length; index += 1) {
      const below = sorted[index - 1] as HeightStop;
      const above = sorted[index] as HeightStop;
      if (y >= above.y || index === sorted.length - 1) {
        const fraction = (below.y - y) / (below.y - above.y);
        return below.height + fraction * (above.height - below.height);
      }
    }
    return lowest.height;
  };
}

/** A goal area on a course, reached in order (summits, gates, finish line). */
export interface CourseGoal extends Box {
  /** Where the player respawns once this goal is a checkpoint: their feet, world pixels. */
  respawnX: number;
  respawnY: number;
}

/** What changed in one {@link CourseProgress.update}. */
export interface CourseProgressUpdate {
  /** Index of a goal reached in this update, if any. */
  reachedGoal?: number;
  /** True in the update that reached the last goal. */
  finished: boolean;
}

/**
 * Tracks which goals a player has reached, in order, plus the best height and the active
 * checkpoint. Goals must be reached in order: touching goal 3 before goal 2 counts for
 * nothing, matching the server rule that summits are reached in order.
 */
export class CourseProgress {
  private reached = 0;
  private bestY = Number.POSITIVE_INFINITY;

  constructor(
    readonly goals: readonly CourseGoal[],
    /** When true, each reached goal becomes a respawn point. */
    readonly checkpointsEnabled: boolean,
  ) {}

  /** Number of goals reached so far. */
  get goalsReached(): number {
    return this.reached;
  }

  /** True once every goal has been reached. */
  get finished(): boolean {
    return this.goals.length > 0 && this.reached >= this.goals.length;
  }

  /** Highest point (smallest y) the player's feet have reached. */
  get bestFootY(): number {
    return this.bestY;
  }

  /** The goal the player would respawn at, if checkpoints are on and one was reached. */
  get checkpoint(): CourseGoal | undefined {
    if (!this.checkpointsEnabled || this.reached === 0) return undefined;
    return this.goals[this.reached - 1];
  }

  /**
   * Records the player's collision box after a step. A goal counts only when the player
   * stands inside it (`onGround`), so jumping up through a summit ledge does not reach it.
   */
  update(box: Box, onGround: boolean): CourseProgressUpdate {
    this.bestY = Math.min(this.bestY, box.y + box.height);
    const next = this.goals[this.reached];
    if (!next || this.finished || !onGround || !overlaps(box, next)) return { finished: false };
    this.reached += 1;
    return { reachedGoal: this.reached - 1, finished: this.finished };
  }

  /**
   * True when checkpoints are on and the player's feet are more than `margin` pixels below
   * the active checkpoint, so offering a respawn would help.
   */
  isBelowCheckpoint(footY: number, margin: number): boolean {
    const checkpoint = this.checkpoint;
    return checkpoint !== undefined && footY > checkpoint.respawnY + margin;
  }

  /**
   * Sets how many goals were reached, for a device that rejoins a game in progress. Goals
   * can only be restored in order, so this never skips one the server has not counted.
   */
  restore(goalsReached: number, bestFootY: number = Number.POSITIVE_INFINITY): void {
    this.reached = Math.max(0, Math.min(this.goals.length, Math.floor(goalsReached)));
    this.bestY = Math.min(this.bestY, bestFootY);
  }

  /** Forgets all progress, for "Play again". */
  reset(): void {
    this.reached = 0;
    this.bestY = Number.POSITIVE_INFINITY;
  }
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
