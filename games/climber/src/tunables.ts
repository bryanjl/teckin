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
}

/** Physics and world-size numbers for the Climber game. */
export interface ClimberPhysicsTunables {
  /** Edge length of one map tile in world pixels. */
  tileSize: number;
  /** Fixed course width in tiles; the screen width shows exactly this many in portrait. */
  worldWidthTiles: number;
  /** Least course height, in tiles, kept visible in landscape. */
  minimumVisibleHeightTiles: number;
  gravity: number;
  runSpeed: number;
  jumpVelocity: number;
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
  physics: Object.freeze({
    tileSize: 32,
    worldWidthTiles: 12,
    minimumVisibleHeightTiles: 11,
    gravity: 1400,
    runSpeed: 190,
    jumpVelocity: 560,
    cameraLookAhead: 64,
    cameraLerpY: 0.12,
  }),
});
