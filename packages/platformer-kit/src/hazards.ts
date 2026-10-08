import type { Box, CollisionGrid } from './collision-grid';
import {
  footOf,
  stepPlatformer,
  type PlatformerBody,
  type PlatformerEvent,
  type PlatformerInput,
  type PlatformerStep,
  type PlatformerTuning,
} from './controller';
import type { Ledge } from './course-bot';

/**
 * A ledge that slides back and forth sideways, carrying whoever stands on it. It behaves
 * like a one-way ledge: jump up through it, land on it from above.
 */
export interface MovingPlatformSpec {
  id: string;
  /** Top-left at the start of its cycle, world pixels; `y` is its standing surface. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** How far it travels sideways from `x`, world pixels (negative moves left). */
  travelX: number;
  /** Seconds for a full there-and-back cycle. */
  periodSeconds: number;
  /** Where in its cycle it starts, 0 to 1. */
  phase: number;
}

/** A switching zone that is active for `onSeconds`, then idle for `offSeconds`. */
export interface TimedZoneSpec {
  id: string;
  zone: Box;
  onSeconds: number;
  offSeconds: number;
  /** Seconds into the cycle at time zero. */
  offsetSeconds: number;
}

/** A steam vent: while on, anything in its zone is pushed sideways. */
export interface VentSpec extends TimedZoneSpec {
  /** Sideways push in px/s; negative pushes left. */
  pushSpeed: number;
}

/** A spark barrier: while on, touching it knocks the player down. */
export type BarrierSpec = TimedZoneSpec;

/** A run of crumbling tiles on one row, which fall away after being stood on. */
export interface CrumblingLedgeSpec {
  row: number;
  fromColumn: number;
  toColumn: number;
  /** How the tiles collide while intact (default one-way). */
  collision?: 'oneWay' | 'solid';
}

/** Every hazard on a course plus their shared timings. */
export interface HazardLayout {
  movingPlatforms: MovingPlatformSpec[];
  vents: VentSpec[];
  barriers: BarrierSpec[];
  crumblingLedges: CrumblingLedgeSpec[];
  /** Seconds a crumbling ledge shakes after first being stood on, before it falls. */
  crumbleDelaySeconds: number;
  /** Seconds before a fallen ledge comes back. */
  crumbleRespawnSeconds: number;
  /** Downward speed given by a barrier hit, px/s. */
  barrierKnockSpeed: number;
}

/** State of one crumbling ledge, for drawing. */
export interface CrumblingLedgeState {
  ledge: CrumblingLedgeSpec;
  state: 'intact' | 'shaking' | 'gone';
  /** Seconds until the state changes (0 while intact). */
  secondsLeft: number;
}

/** Extra events hazards add to a step. */
export type HazardEvent = PlatformerEvent | 'knockedDown' | 'crumbled';

/** One step with hazards applied. */
export interface HazardStep {
  body: PlatformerBody;
  events: HazardEvent[];
  /** Sideways distance moved by hazards (platform carry, vents), not by the player. */
  pushedX: number;
}

/** Groups tiles marked as crumbling into ledges (horizontal runs on one row). */
export function crumblingLedgesFromTiles(
  tiles: readonly { column: number; row: number; hazard?: string }[],
): CrumblingLedgeSpec[] {
  const cells = tiles
    .filter((tile) => tile.hazard === 'crumbling')
    .sort((a, b) => a.row - b.row || a.column - b.column);
  const ledges: CrumblingLedgeSpec[] = [];
  for (const cell of cells) {
    const last = ledges[ledges.length - 1];
    if (last && last.row === cell.row && last.toColumn === cell.column - 1) {
      last.toColumn = cell.column;
    } else {
      ledges.push({ row: cell.row, fromColumn: cell.column, toColumn: cell.column });
    }
  }
  return ledges;
}

/** True while a timed zone is on at time `t` seconds. */
export function isZoneOn(spec: TimedZoneSpec, t: number): boolean {
  const cycle = spec.onSeconds + spec.offSeconds;
  if (cycle <= 0) return true;
  const within = (((t + spec.offsetSeconds) % cycle) + cycle) % cycle;
  return within < spec.onSeconds;
}

/** Seconds until a timed zone next switches on (0 while on). */
export function secondsUntilOn(spec: TimedZoneSpec, t: number): number {
  const cycle = spec.onSeconds + spec.offSeconds;
  if (cycle <= 0) return 0;
  const within = (((t + spec.offsetSeconds) % cycle) + cycle) % cycle;
  return within < spec.onSeconds ? 0 : cycle - within;
}

/** Top-left of a moving platform at time `t` (smooth ease in and out at each end). */
export function movingPlatformBox(spec: MovingPlatformSpec, t: number): Box {
  const angle = 2 * Math.PI * (t / spec.periodSeconds + spec.phase);
  const travelled = spec.travelX * (0.5 - 0.5 * Math.cos(angle));
  return { x: spec.x + travelled, y: spec.y, width: spec.width, height: spec.height };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// Feet within this many pixels of a platform top count as standing on it.
const standingTolerance = 0.75;

/**
 * Moving platforms, vents, spark barriers and crumbling ledges for one player, driven by
 * the course clock so every client (and later the server) sees the same platform positions
 * and switch timings. Crumbling depends on where this player stood, so each player has
 * their own field. Pure: no Phaser, no DOM.
 */
export class HazardField {
  private time = 0;
  private readonly crumbling: CrumblingLedgeState[];

  constructor(
    readonly layout: HazardLayout,
    private readonly grid: CollisionGrid,
  ) {
    this.crumbling = layout.crumblingLedges.map((ledge) => ({
      ledge,
      state: 'intact',
      secondsLeft: 0,
    }));
  }

  /** Course clock in seconds. */
  get seconds(): number {
    return this.time;
  }

  /** Every moving platform's box right now. */
  platformBoxes(): { spec: MovingPlatformSpec; box: Box }[] {
    return this.layout.movingPlatforms.map((spec) => ({
      spec,
      box: movingPlatformBox(spec, this.time),
    }));
  }

  /** Crumbling ledges and their states. */
  crumblingStates(): readonly CrumblingLedgeState[] {
    return this.crumbling;
  }

  /** True while the vent or barrier is on. */
  isOn(spec: TimedZoneSpec): boolean {
    return isZoneOn(spec, this.time);
  }

  /** True when an active vent is pushing a box of the given size at `body`'s position. */
  isPushed(body: Pick<PlatformerBody, 'x' | 'y'>, tuning: PlatformerTuning): boolean {
    const box: Box = { x: body.x, y: body.y, width: tuning.bodyWidth, height: tuning.bodyHeight };
    return this.layout.vents.some((vent) => this.isOn(vent) && overlaps(box, vent.zone));
  }

  /** Moving platforms as ledges with fractional columns, for the course bot. */
  dynamicLedges(): Ledge[] {
    const size = this.grid.tileSize;
    return this.platformBoxes().map(({ box }) => ({
      row: Math.round(box.y / size),
      fromColumn: box.x / size,
      toColumn: (box.x + box.width) / size - 1,
      collision: 'oneWay' as const,
      moving: true,
    }));
  }

  /** True when a barrier is on now or will be within `withinSeconds`, near `area`. */
  barrierThreatens(area: Box, withinSeconds: number): boolean {
    return this.layout.barriers.some(
      (barrier) =>
        overlaps(area, barrier.zone) &&
        (this.isOn(barrier) || secondsUntilOn(barrier, this.time) < withinSeconds),
    );
  }

  /** Back to time zero with every ledge restored. */
  reset(): void {
    this.time = 0;
    for (const entry of this.crumbling) {
      if (entry.state === 'gone')
        this.setLedgeCells(entry.ledge, entry.ledge.collision ?? 'oneWay');
      entry.state = 'intact';
      entry.secondsLeft = 0;
    }
  }

  /**
   * Advances the clock by `dt` and moves `body` one step with every hazard applied:
   * carried by the platform it stands on, pushed by vents, landing on moving platforms,
   * knocked down by barriers, and crumbling ledges counting down under its feet.
   */
  step(
    body: PlatformerBody,
    input: PlatformerInput,
    tuning: PlatformerTuning,
    dt: number,
  ): HazardStep {
    const before = this.time;
    const after = before + dt;
    let current = body;
    const box = (b: PlatformerBody): Box => ({
      x: b.x,
      y: b.y,
      width: tuning.bodyWidth,
      height: tuning.bodyHeight,
    });

    // Ride the platform underfoot.
    const riding = body.onGround ? this.platformUnder(body, tuning, before) : undefined;
    if (riding) {
      const dx = movingPlatformBox(riding, after).x - movingPlatformBox(riding, before).x;
      const moved = this.grid.move(box(current), dx, 0);
      current = { ...current, x: moved.x };
    }
    // Vents push sideways while on.
    for (const vent of this.layout.vents) {
      if (isZoneOn(vent, before) && overlaps(box(current), vent.zone)) {
        const moved = this.grid.move(box(current), vent.pushSpeed * dt, 0);
        current = { ...current, x: moved.x };
      }
    }

    const step: PlatformerStep = stepPlatformer(current, input, this.grid, tuning, dt);
    let next = step.body;
    const events: HazardEvent[] = [...step.events];

    // Land on (or stay on) a moving platform.
    if (!next.onGround && next.velocityY >= 0) {
      const footBefore = footOf(current, tuning);
      const footAfter = footOf(next, tuning);
      for (const spec of this.layout.movingPlatforms) {
        const platform = movingPlatformBox(spec, after);
        const overlapsX =
          footAfter.x + tuning.bodyWidth / 2 > platform.x &&
          footAfter.x - tuning.bodyWidth / 2 < platform.x + platform.width;
        if (
          overlapsX &&
          footBefore.y <= platform.y + standingTolerance &&
          footAfter.y >= platform.y
        ) {
          next = {
            ...next,
            y: platform.y - tuning.bodyHeight,
            velocityY: 0,
            onGround: true,
            airJumpsUsed: 0,
            jumpRising: false,
          };
          const leaveIndex = events.indexOf('leaveGround');
          if (leaveIndex >= 0) events.splice(leaveIndex, 1);
          if (!current.onGround && !events.includes('land')) events.push('land');
          break;
        }
      }
    }

    // Spark barriers knock the player down and use up the double jump.
    for (const barrier of this.layout.barriers) {
      if (isZoneOn(barrier, after) && overlaps(box(next), barrier.zone)) {
        next = {
          ...next,
          velocityX: 0,
          velocityY: Math.max(next.velocityY, this.layout.barrierKnockSpeed),
          jumpRising: false,
          airJumpsUsed: tuning.airJumps,
          onGround: false,
        };
        events.push('knockedDown');
        break;
      }
    }

    this.updateCrumbling(next, tuning, dt, events);
    this.time = after;
    return { body: next, events, pushedX: current.x - body.x };
  }

  private platformUnder(
    body: PlatformerBody,
    tuning: PlatformerTuning,
    t: number,
  ): MovingPlatformSpec | undefined {
    const foot = footOf(body, tuning);
    return this.layout.movingPlatforms.find((spec) => {
      const platform = movingPlatformBox(spec, t);
      return (
        Math.abs(foot.y - platform.y) <= standingTolerance &&
        foot.x + tuning.bodyWidth / 2 > platform.x &&
        foot.x - tuning.bodyWidth / 2 < platform.x + platform.width
      );
    });
  }

  private updateCrumbling(
    body: PlatformerBody,
    tuning: PlatformerTuning,
    dt: number,
    events: HazardEvent[],
  ): void {
    const size = this.grid.tileSize;
    const foot = footOf(body, tuning);
    for (const entry of this.crumbling) {
      const { ledge } = entry;
      const left = ledge.fromColumn * size;
      const right = (ledge.toColumn + 1) * size;
      const standing =
        body.onGround &&
        Math.abs(foot.y - ledge.row * size) <= standingTolerance &&
        foot.x + tuning.bodyWidth / 2 > left &&
        foot.x - tuning.bodyWidth / 2 < right;
      if (entry.state === 'intact') {
        if (standing) {
          entry.state = 'shaking';
          entry.secondsLeft = this.layout.crumbleDelaySeconds;
        }
        continue;
      }
      entry.secondsLeft -= dt;
      if (entry.secondsLeft > 0) continue;
      if (entry.state === 'shaking') {
        entry.state = 'gone';
        entry.secondsLeft = this.layout.crumbleRespawnSeconds;
        this.setLedgeCells(ledge, 'empty');
        events.push('crumbled');
      } else {
        // Come back only when nobody is inside the tiles, so no one is trapped in them.
        const cells: Box = { x: left, y: ledge.row * size, width: right - left, height: size };
        const playerBox: Box = {
          x: body.x,
          y: body.y,
          width: tuning.bodyWidth,
          height: tuning.bodyHeight,
        };
        if (overlaps(cells, playerBox)) {
          entry.secondsLeft = 0;
          continue;
        }
        entry.state = 'intact';
        entry.secondsLeft = 0;
        this.setLedgeCells(ledge, ledge.collision ?? 'oneWay');
      }
    }
  }

  private setLedgeCells(ledge: CrumblingLedgeSpec, collision: 'oneWay' | 'solid' | 'empty'): void {
    for (let column = ledge.fromColumn; column <= ledge.toColumn; column += 1) {
      this.grid.set(column, ledge.row, collision);
    }
  }
}
