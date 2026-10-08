import type { ClimberTunables } from '../tunables';

/** Movement limits that follow from the player's energy. */
export interface EnergyLimits {
  groundJumpAllowed: boolean;
  airJumpAllowed: boolean;
  /** True at zero energy: the player crawls slowly and moving costs nothing. */
  crawling: boolean;
  speedScale: number;
}

/**
 * What the player may do with `energy`. A jump needs its full cost (a 10-energy jump with
 * 5 energy left does not happen), and only an empty meter switches to the free crawl, so a
 * low meter still walks normally until it runs out.
 */
export function energyLimits(
  energy: number,
  tunables: Pick<ClimberTunables, 'jumpCost' | 'doubleJumpCost' | 'crawlSpeedScale'>,
): EnergyLimits {
  const crawling = energy <= 0;
  return {
    groundJumpAllowed: energy >= tunables.jumpCost,
    airJumpAllowed: energy >= tunables.doubleJumpCost,
    crawling,
    speedScale: crawling ? tunables.crawlSpeedScale : 1,
  };
}
