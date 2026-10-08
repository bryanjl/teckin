import type { CollisionGrid, TileCollision } from './collision-grid';
import { footOf, type PlatformerBody, type PlatformerTuning } from './controller';

/** A run of standable tiles on one row: the tiles collide and the tile above is empty. */
export interface Ledge {
  row: number;
  /** First and last column, inclusive. */
  fromColumn: number;
  toColumn: number;
  collision: Exclude<TileCollision, 'empty'>;
  /** True for a ledge that moves (a moving platform); its columns may be fractional. */
  moving?: boolean;
}

/** What the bot may know about hazards: moving ledges and when to hold still. */
export interface BotHazardView {
  /** Ledges that move, at their current positions. */
  movingLedges: () => Ledge[];
  /** True when the bot, standing still, should wait (for example for a barrier). */
  shouldWait?: (body: PlatformerBody, target: Ledge | undefined) => boolean;
}

/** Buttons the bot wants held this frame. */
export interface BotButtons {
  left: boolean;
  right: boolean;
  jump: boolean;
}

/** Every ledge in the grid, top row first. */
export function findLedges(grid: CollisionGrid): Ledge[] {
  const ledges: Ledge[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    let current: Ledge | undefined;
    for (let column = 0; column < grid.columns; column += 1) {
      const collision = grid.at(column, row);
      const standable = collision !== 'empty' && grid.at(column, row - 1) === 'empty';
      if (standable && current && current.collision === collision) {
        current.toColumn = column;
      } else if (standable) {
        current = { row, fromColumn: column, toColumn: column, collision };
        ledges.push(current);
      } else {
        current = undefined;
      }
    }
  }
  return ledges;
}

/**
 * A simple climbing bot for automated tests and playtests: from the ledge it stands on, it
 * picks the lowest ledge above within reach, walks to a take-off point and jumps, using the
 * mid-air jump near the top of the jump when it needs more height. It reads only what a
 * player could see and presses only the buttons a player has, so a course the bot can climb
 * is a course a person can climb.
 */
export class CourseBot {
  private readonly ledges: Ledge[];
  private target: Ledge | undefined;
  private jumpWasDown = false;

  constructor(
    private readonly grid: CollisionGrid,
    private readonly tuning: PlatformerTuning,
    /** Highest climb, in tiles, the bot will attempt in one go. */
    private readonly maxRiseTiles = 5,
    private readonly hazards?: BotHazardView,
  ) {
    this.ledges = findLedges(grid);
  }

  /** The ledge the bot is heading for, if any. */
  get currentTarget(): Ledge | undefined {
    return this.target;
  }

  /** Decides which buttons to hold for this frame. */
  decide(body: PlatformerBody): BotButtons {
    const size = this.grid.tileSize;
    const foot = footOf(body, this.tuning);
    const buttons: BotButtons = { left: false, right: false, jump: false };

    const moving = this.hazards?.movingLedges() ?? [];
    if (this.target?.moving) {
      // Follow the moving ledge being aimed at to where it is now.
      const previous = this.target;
      this.target = moving
        .filter((ledge) => ledge.row === previous.row)
        .sort(
          (a, b) =>
            Math.abs(a.fromColumn - previous.fromColumn) -
            Math.abs(b.fromColumn - previous.fromColumn),
        )[0];
    }

    if (body.onGround) {
      const standing = this.ledgeUnder(foot.x, foot.y, moving);
      if (!standing) return this.remember(buttons);
      const target0 = this.target;
      if (
        !target0 ||
        target0.row >= standing.row ||
        standing.row - target0.row > this.maxRiseTiles
      ) {
        this.target = this.pickTarget(standing, moving);
      }
      const target = this.target;
      if (!target) return this.remember(buttons);
      if (this.hazards?.shouldWait?.(body, target)) {
        // Hold position on the ledge while waiting (a vent may be pushing).
        this.steerTowardTarget(foot.x, standing, buttons, true);
        return this.remember(buttons);
      }
      // A moving ledge (or a ledge reached from one) is only worth jumping for while the two
      // overlap; until then, wait where we are and let the platform come round.
      if ((target.moving || standing.moving) && !this.overlapsColumns(standing, target)) {
        if (standing.moving) this.steerTowardTarget(foot.x, standing, buttons, true);
        return this.remember(buttons);
      }

      const takeOff = this.takeOffX(standing, target);
      const distance = takeOff - foot.x;
      if (Math.abs(distance) > size * 0.2) {
        buttons.left = distance < 0;
        buttons.right = distance > 0;
        const runningJump = target.collision === 'solid' || !this.overlapsColumns(standing, target);
        // A running jump goes when the edge is close; overshooting walks off the ledge.
        if (runningJump && Math.abs(distance) < size * 0.6) buttons.jump = !this.jumpWasDown;
      } else {
        buttons.jump = !this.jumpWasDown;
        this.steerTowardTarget(foot.x, target, buttons, true);
      }
      return this.remember(buttons);
    }

    const target = this.target;
    if (!target) return this.remember(buttons);
    const targetTop = target.row * size;
    const aboveTarget = foot.y <= targetTop;
    this.steerTowardTarget(foot.x, target, buttons, aboveTarget);
    // Air jump only when the first jump will not clear the target ledge with room to spare,
    // never while already dropping onto it from above.
    const descendingOntoTarget = body.velocityY >= 0 && foot.y <= targetTop;
    const needsHeight = foot.y > targetTop - size * 0.2 && !descendingOntoTarget;
    const canAirJump = body.airJumpsUsed < this.tuning.airJumps;
    if (body.velocityY < -60) {
      buttons.jump = this.jumpWasDown;
    } else if (needsHeight && canAirJump && body.velocityY < 200) {
      // Release for one frame, then press: a fresh press is what triggers the air jump.
      buttons.jump = !this.jumpWasDown;
    }
    return this.remember(buttons);
  }

  private remember(buttons: BotButtons): BotButtons {
    this.jumpWasDown = buttons.jump;
    return buttons;
  }

  private steerTowardTarget(
    footX: number,
    target: Ledge,
    buttons: BotButtons,
    toCentre: boolean,
  ): void {
    const size = this.grid.tileSize;
    const left = target.fromColumn * size;
    const right = (target.toColumn + 1) * size;
    let aim = (left + right) / 2;
    if (!toCentre && target.collision === 'solid') {
      // Below a solid ledge: rise beside its nearer edge, then move over once above it.
      const clearance = this.tuning.bodyWidth / 2 + size * 0.3;
      aim = footX < aim ? left - clearance : right + clearance;
    }
    if (Math.abs(aim - footX) < size * 0.25) return;
    buttons.left = aim < footX;
    buttons.right = aim > footX;
  }

  private ledgeUnder(footX: number, footY: number, moving: readonly Ledge[]): Ledge | undefined {
    const size = this.grid.tileSize;
    const row = Math.round(footY / size);
    const half = this.tuning.bodyWidth / 2;
    return [...moving, ...this.ledges].find(
      (ledge) =>
        ledge.row === row &&
        footX + half > ledge.fromColumn * size &&
        footX - half < (ledge.toColumn + 1) * size,
    );
  }

  private pickTarget(standing: Ledge, moving: readonly Ledge[]): Ledge | undefined {
    const size = this.grid.tileSize;
    const centre = ((standing.fromColumn + standing.toColumn + 1) / 2) * size;
    const candidates = [...this.ledges, ...moving].filter(
      (ledge) => ledge.row < standing.row && standing.row - ledge.row <= this.maxRiseTiles,
    );
    candidates.sort((a, b) => {
      if (a.row !== b.row) return b.row - a.row;
      const aCentre = ((a.fromColumn + a.toColumn + 1) / 2) * size;
      const bCentre = ((b.fromColumn + b.toColumn + 1) / 2) * size;
      return Math.abs(aCentre - centre) - Math.abs(bCentre - centre);
    });
    return candidates[0];
  }

  private overlapsColumns(a: Ledge, b: Ledge): boolean {
    return a.fromColumn <= b.toColumn - 1 && b.fromColumn <= a.toColumn - 1;
  }

  /** Where on the standing ledge to jump from to reach `target`. */
  private takeOffX(standing: Ledge, target: Ledge): number {
    const size = this.grid.tileSize;
    const standLeft = standing.fromColumn * size + this.tuning.bodyWidth / 2;
    const standRight = (standing.toColumn + 1) * size - this.tuning.bodyWidth / 2;
    const targetCentre = ((target.fromColumn + target.toColumn + 1) / 2) * size;
    if (target.collision === 'oneWay' && this.overlapsColumns(standing, target)) {
      // Jump up through the ledge from below, under its middle where possible.
      const overlapLeft = Math.max(standing.fromColumn, target.fromColumn) * size + size;
      const overlapRight = (Math.min(standing.toColumn, target.toColumn) + 1) * size - size;
      const aim = Math.min(Math.max(targetCentre, overlapLeft), overlapRight);
      return Math.min(Math.max(aim, standLeft), standRight);
    }
    // Run toward the target and leave from the nearest edge.
    return targetCentre < (standLeft + standRight) / 2 ? standLeft : standRight;
  }
}
