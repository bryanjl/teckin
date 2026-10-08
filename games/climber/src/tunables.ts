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
  /** Running speed multiplier at zero energy: a slow, free crawl to a safer spot. */
  crawlSpeedScale: number;
  /** The "Get energy" button pulses below this much energy. */
  lowEnergyThreshold: number;
  /** Energy the meter is drawn full at; more is allowed and shows as a full meter. */
  energyMeterFull: number;
  /** Movement and world physics, in world pixels and seconds. */
  physics: ClimberPhysicsTunables;
  /** Total course height shown to players; each of the six summits is a sixth of it. */
  courseHeightMetres: number;
  /** How far below the checkpoint, in tiles, a player must fall before respawn is offered. */
  respawnOfferDropTiles: number;
  /** Hazard timings shared by every hazard of a kind; positions come from the map. */
  hazards: ClimberHazardTunables;
}

/** Hazard numbers that are the same everywhere on the course. */
export interface ClimberHazardTunables {
  /** Seconds a crumbling ledge shakes after being stood on before it falls. */
  crumbleDelaySeconds: number;
  /** Seconds before a fallen ledge comes back. */
  crumbleRespawnSeconds: number;
  /** Downward speed a spark barrier gives the player, px/s. */
  barrierKnockSpeed: number;
  /** Seconds before a barrier switches on that it flickers as a warning. */
  barrierWarningSeconds: number;
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
  jumpCost: 20,
  doubleJumpCost: 26,
  walkingCostPerTile: 2,
  crawlSpeedScale: 0.35,
  lowEnergyThreshold: 20,
  energyMeterFull: 200,
  courseHeightMetres: 1000,
  respawnOfferDropTiles: 3,
  hazards: Object.freeze({
    crumbleDelaySeconds: 0.9,
    crumbleRespawnSeconds: 3,
    barrierKnockSpeed: 350,
    barrierWarningSeconds: 0.6,
  }),
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
