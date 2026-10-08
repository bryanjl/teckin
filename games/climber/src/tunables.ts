import type { PlatformerTuning } from '@teckin/platformer-kit';

/**
 * Every tunable number for the Climber game, in one place. Values start at the spec's
 * defaults and are adjusted by playtests; nothing else in the game hard-codes them.
 */
export interface ClimberTunables {
  startingEnergy: number;
  jumpCost: number;
  doubleJumpCost: number;
  walkingCostPerTile: number;
  /** Movement and world physics, in world pixels and seconds. */
  physics: ClimberPhysicsTunables;
  /** Total course height shown to players; each of the six summits is a sixth of it. */
  courseHeightMetres: number;
  /** How far below the checkpoint, in tiles, a player must fall before respawn is offered. */
  respawnOfferDropTiles: number;
}

/**
 * Physics and world-size numbers for the Climber game. Movement feel (speeds, jump rules,
 * collision box) comes from the platformer kit's {@link PlatformerTuning}.
 */
export interface ClimberPhysicsTunables extends PlatformerTuning {
  /** Edge length of one map tile in world pixels. */
  tileSize: number;
  /** Fixed course width in tiles; the screen width shows exactly this many in portrait. */
  worldWidthTiles: number;
  /** Least course height, in tiles, kept visible in landscape. */
  minimumVisibleHeightTiles: number;
  /** Simulation step in seconds; movement is identical at any frame rate. */
  fixedStep: number;
  /** How far above the player the camera looks, in world pixels. */
  cameraLookAhead: number;
  /** Vertical camera smoothing, 0 (frozen) to 1 (locked to the player). */
  cameraLerpY: number;
}

/** Starting values from the spec's tunables table, plus first-guess physics. */
export const defaultClimberTunables: Readonly<ClimberTunables> = Object.freeze({
  startingEnergy: 50,
  jumpCost: 10,
  doubleJumpCost: 15,
  walkingCostPerTile: 1,
  courseHeightMetres: 1000,
  respawnOfferDropTiles: 3,
  physics: Object.freeze({
    tileSize: 32,
    worldWidthTiles: 12,
    minimumVisibleHeightTiles: 11,
    fixedStep: 1 / 120,
    bodyWidth: 20,
    bodyHeight: 30,
    runSpeed: 190,
    groundAcceleration: 2400,
    airAcceleration: 1500,
    gravity: 1400,
    maxFallSpeed: 900,
    // About 3.5 tiles for a ground jump and 6 with the double jump.
    jumpVelocity: 560,
    airJumpVelocity: 500,
    airJumps: 1,
    coyoteTime: 0.1,
    jumpBufferTime: 0.1,
    jumpReleaseDamping: 0.45,
    cameraLookAhead: 64,
    cameraLerpY: 0.12,
  }),
});
