import type { CollisionGrid } from './collision-grid';

/** Movement feel for a platformer character, in world pixels and seconds. */
export interface PlatformerTuning {
  /** Collision box of the character. */
  bodyWidth: number;
  bodyHeight: number;
  /** Top running speed. */
  runSpeed: number;
  /** How fast running speed is gained or lost on the ground, px/s². */
  groundAcceleration: number;
  /** How fast horizontal speed changes in the air; lower makes a running start matter. */
  airAcceleration: number;
  gravity: number;
  /** Fastest fall speed. Keeps long falls readable and collision steps short. */
  maxFallSpeed: number;
  /** Upward speed of a jump from the ground (or within coyote time). */
  jumpVelocity: number;
  /** Upward speed of each mid-air jump. */
  airJumpVelocity: number;
  /** Mid-air jumps allowed before landing; 1 gives a double jump. */
  airJumps: number;
  /** Grace period after walking off a ledge in which a ground jump still works. */
  coyoteTime: number;
  /** A jump pressed this long before landing still happens on landing. */
  jumpBufferTime: number;
  /** Upward speed is multiplied by this when jump is released early: a short hop. */
  jumpReleaseDamping: number;
}

/** What the player is asking for this step. */
export interface PlatformerInput {
  left: boolean;
  right: boolean;
  /** Jump is held down (used for variable jump height). */
  jumpHeld: boolean;
  /** Jump went down since the previous step. */
  jumpPressed: boolean;
}

/** Full state of one character; plain data so it can be copied, sent or replayed. */
export interface PlatformerBody {
  /** Top-left corner of the collision box, world pixels. */
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  onGround: boolean;
  /** Seconds of coyote time left. */
  coyoteLeft: number;
  /** Seconds a buffered jump press stays valid. */
  jumpBufferLeft: number;
  /** Mid-air jumps used since last on the ground. */
  airJumpsUsed: number;
  /** True while rising from a jump whose button is still held. */
  jumpRising: boolean;
  /** Direction the character last faced: -1 left, 1 right. */
  facing: -1 | 1;
}

/** Something that happened during a step, for sound, haptics, art and networking. */
export type PlatformerEvent = 'jump' | 'airJump' | 'land' | 'leaveGround';

/** Result of one controller step. */
export interface PlatformerStep {
  body: PlatformerBody;
  events: PlatformerEvent[];
}

/** A body standing still with its feet at (`footX`, `footY`) — the bottom centre. */
export function createPlatformerBody(
  footX: number,
  footY: number,
  tuning: PlatformerTuning,
): PlatformerBody {
  return {
    x: footX - tuning.bodyWidth / 2,
    y: footY - tuning.bodyHeight,
    velocityX: 0,
    velocityY: 0,
    onGround: false,
    coyoteLeft: 0,
    jumpBufferLeft: 0,
    airJumpsUsed: 0,
    jumpRising: false,
    facing: 1,
  };
}

/** Bottom centre of a body, where its feet are. */
export function footOf(
  body: Pick<PlatformerBody, 'x' | 'y'>,
  tuning: PlatformerTuning,
): {
  x: number;
  y: number;
} {
  return { x: body.x + tuning.bodyWidth / 2, y: body.y + tuning.bodyHeight };
}

/**
 * Advances one character by `dt` seconds. Pure: the same inputs always give the same
 * result, so the client, tests and (later) the server's movement checks share it.
 *
 * Jump rules: a ground jump works while standing or within `coyoteTime` of leaving a ledge;
 * a press up to `jumpBufferTime` before landing jumps on landing; releasing jump while
 * rising cuts the jump short; in the air, a press spends one of `airJumps`. Falling only
 * ever stops on a tile, so missing a jump drops the player to whatever is below.
 */
export function stepPlatformer(
  body: PlatformerBody,
  input: PlatformerInput,
  grid: CollisionGrid,
  tuning: PlatformerTuning,
  dt: number,
): PlatformerStep {
  const events: PlatformerEvent[] = [];
  const next: PlatformerBody = { ...body };

  // Horizontal: accelerate toward the target speed.
  const direction = Number(input.right) - Number(input.left);
  if (direction !== 0) next.facing = direction < 0 ? -1 : 1;
  const targetSpeed = direction * tuning.runSpeed;
  const acceleration = body.onGround ? tuning.groundAcceleration : tuning.airAcceleration;
  next.velocityX = approach(body.velocityX, targetSpeed, acceleration * dt);

  // Jump timers.
  next.coyoteLeft = body.onGround ? tuning.coyoteTime : Math.max(0, body.coyoteLeft - dt);
  next.jumpBufferLeft = input.jumpPressed
    ? tuning.jumpBufferTime
    : Math.max(0, body.jumpBufferLeft - dt);

  const canGroundJump = body.onGround || next.coyoteLeft > 0;
  if (next.jumpBufferLeft > 0 && canGroundJump) {
    next.velocityY = -tuning.jumpVelocity;
    next.onGround = false;
    next.coyoteLeft = 0;
    next.jumpBufferLeft = 0;
    next.jumpRising = true;
    events.push('jump');
  } else if (input.jumpPressed && !canGroundJump && body.airJumpsUsed < tuning.airJumps) {
    next.velocityY = -tuning.airJumpVelocity;
    next.airJumpsUsed = body.airJumpsUsed + 1;
    next.jumpBufferLeft = 0;
    next.jumpRising = true;
    events.push('airJump');
  }

  // Variable height: letting go while rising cuts the jump short, once.
  if (next.jumpRising && !input.jumpHeld && next.velocityY < 0) {
    next.velocityY *= tuning.jumpReleaseDamping;
    next.jumpRising = false;
  }

  next.velocityY = Math.min(next.velocityY + tuning.gravity * dt, tuning.maxFallSpeed);
  if (next.velocityY >= 0) next.jumpRising = false;

  const moved = grid.move(
    { x: body.x, y: body.y, width: tuning.bodyWidth, height: tuning.bodyHeight },
    next.velocityX * dt,
    next.velocityY * dt,
  );
  next.x = moved.x;
  next.y = moved.y;
  if (moved.hitLeft || moved.hitRight) next.velocityX = 0;
  if (moved.hitCeiling) {
    next.velocityY = 0;
    next.jumpRising = false;
  }

  const wasOnGround = body.onGround && !events.includes('jump');
  next.onGround = moved.landed;
  if (moved.landed) {
    next.velocityY = 0;
    next.airJumpsUsed = 0;
    if (!wasOnGround) events.push('land');
  } else if (wasOnGround) {
    events.push('leaveGround');
  }
  return { body: next, events };
}

function approach(value: number, target: number, maxStep: number): number {
  if (value < target) return Math.min(value + maxStep, target);
  return Math.max(value - maxStep, target);
}

/**
 * Runs a simulation at a fixed step regardless of frame rate, so movement is identical at
 * 30, 60 or 120 fps. Leftover time carries to the next frame; a long stall (tab hidden,
 * slow device) is capped so the character never teleports.
 */
export class FixedStepper {
  private carried = 0;

  constructor(
    /** Step length in seconds. */
    readonly step: number,
    /** Longest frame simulated, in seconds; anything beyond is dropped. */
    readonly maxFrame = 0.1,
  ) {}

  /**
   * Splits a frame of `frameSeconds` into whole steps and calls `run(stepIndex)` for each.
   * Returns the fraction of a step left over, for interpolating the drawn position.
   */
  advance(frameSeconds: number, run: (stepIndex: number) => void): number {
    this.carried += Math.min(Math.max(frameSeconds, 0), this.maxFrame);
    let index = 0;
    while (this.carried >= this.step - 1e-9) {
      this.carried = Math.max(0, this.carried - this.step);
      run(index);
      index += 1;
    }
    return this.carried / this.step;
  }

  /** Drops any carried time, for example after a respawn. */
  reset(): void {
    this.carried = 0;
  }
}
