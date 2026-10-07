/**
 * Every tunable number for the Climber game, in one place. Values start at the spec's
 * defaults and are adjusted by playtests; nothing else in the game hard-codes them.
 */
export interface ClimberTunables {
  startingEnergy: number;
  jumpCost: number;
  doubleJumpCost: number;
  walkingCostPerTile: number;
}

/** Starting values from the spec's tunables table. */
export const defaultClimberTunables: Readonly<ClimberTunables> = Object.freeze({
  startingEnergy: 50,
  jumpCost: 10,
  doubleJumpCost: 15,
  walkingCostPerTile: 1,
});
