import { climberVariantSwatches, type ClimberPlayerVariant } from '../theme';
import { defaultClimberTunables, type ClimberTunables } from '../tunables';
import { climberVariantFor, type ClimberRoomStateView } from './climber-state-view';

/** One player's dot on the host's tower view. */
export interface TowerDot {
  playerId: string;
  nickname: string;
  /** Height up the course, 0 (the start) to 1 (the top). */
  heightFraction: number;
  /** Sideways position, 0 (left wall) to 1 (right wall). */
  sideFraction: number;
  heightMetres: number;
  rank: number;
  finished: boolean;
  connected: boolean;
  variant: ClimberPlayerVariant;
  /** Fill colour matching the player's climber on the phones. */
  colour: string;
}

/** A summit line across the tower. */
export interface TowerSummitMark {
  /** 1-based summit number, matching the theme's summit names. */
  number: number;
  heightFraction: number;
  heightMetres: number;
}

/** Everything the host's tower view draws. */
export interface TowerModel {
  summits: TowerSummitMark[];
  /** Best ranked last, so the leaders are drawn on top when dots overlap. */
  dots: TowerDot[];
  courseHeightMetres: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * A small, stable sideways nudge per player (±3% of the width), so climbers standing on the
 * same spot (everyone at the start) show as a cluster rather than a single dot.
 */
function sideNudge(playerId: string): number {
  let hash = 0;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (Math.imul(hash, 31) + playerId.charCodeAt(index)) | 0;
  }
  return (((hash >>> 0) % 61) - 30) / 1000;
}

/**
 * The host's tower view of a Climber room: one dot per player at their height and sideways
 * position, and a line for each summit. Removed players are left out.
 */
export function climberTowerModel(
  state: ClimberRoomStateView,
  tunables: Pick<ClimberTunables, 'courseHeightMetres' | 'physics'> = defaultClimberTunables,
): TowerModel {
  const { courseHeightMetres } = tunables;
  const worldWidth = tunables.physics.worldWidthTiles * tunables.physics.tileSize;
  const summitCount = state.summitCount || 6;
  const summits: TowerSummitMark[] = Array.from({ length: summitCount }, (_, index) => {
    const number = index + 1;
    const heightMetres = Math.round((courseHeightMetres * number) / summitCount);
    return { number, heightMetres, heightFraction: number / summitCount };
  });

  const dots: TowerDot[] = [];
  state.climbers.forEach((climber, playerId) => {
    const player = state.players.get(playerId);
    if (!player || player.removed) return;
    const variant = climberVariantFor(playerId);
    dots.push({
      playerId,
      nickname: player.nickname,
      heightFraction: climber.finished ? 1 : clamp01(climber.heightMetres / courseHeightMetres),
      sideFraction: clamp01(climber.x / worldWidth + sideNudge(playerId)),
      heightMetres: climber.heightMetres,
      rank: climber.rank,
      finished: climber.finished,
      connected: player.connected,
      variant,
      colour: climberVariantSwatches[variant],
    });
  });
  // Unranked (rank 0, just joined) count as last.
  const order = (dot: TowerDot): number => dot.rank || Number.MAX_SAFE_INTEGER;
  dots.sort((a, b) => order(b) - order(a));
  return { summits, dots, courseHeightMetres };
}
