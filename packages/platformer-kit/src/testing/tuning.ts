import type { PlatformerTuning } from '../controller';

/** Tuning used across the kit's tests: 32 px tiles, about 3.5 tiles per jump. */
export const testTuning: PlatformerTuning = {
  bodyWidth: 20,
  bodyHeight: 28,
  runSpeed: 190,
  groundAcceleration: 2400,
  airAcceleration: 1400,
  gravity: 1400,
  maxFallSpeed: 900,
  jumpVelocity: 560,
  airJumpVelocity: 500,
  airJumps: 1,
  coyoteTime: 0.1,
  jumpBufferTime: 0.1,
  jumpReleaseDamping: 0.45,
};
