/** What the ranking needs to know about one climber. */
export interface ClimberStanding {
  playerId: string;
  /** Height now, metres. */
  heightMetres: number;
  /** Best height reached, metres. */
  bestHeightMetres: number;
  /** When the best height was first reached (ms, server clock). */
  bestHeightAtMs: number;
  /** When the player reached the top, or `null`. */
  finishedAtMs: number | null;
  /** When the player joined, the last tie-break. */
  joinedAtMs: number;
}

/**
 * Orders climbers best first, following the spec: anyone who reached the top, earliest
 * first; then current height; ties broken by best height, then by who reached that best
 * height first. Returns player ids with ranks from 1; equal ranks never happen because the
 * last tie-break is join order.
 */
export function rankClimbers(
  standings: readonly ClimberStanding[],
): { playerId: string; rank: number }[] {
  const sorted = [...standings].sort((a, b) => {
    if (a.finishedAtMs !== null || b.finishedAtMs !== null) {
      if (a.finishedAtMs === null) return 1;
      if (b.finishedAtMs === null) return -1;
      if (a.finishedAtMs !== b.finishedAtMs) return a.finishedAtMs - b.finishedAtMs;
    }
    return (
      b.heightMetres - a.heightMetres ||
      b.bestHeightMetres - a.bestHeightMetres ||
      a.bestHeightAtMs - b.bestHeightAtMs ||
      a.joinedAtMs - b.joinedAtMs
    );
  });
  return sorted.map((standing, index) => ({ playerId: standing.playerId, rank: index + 1 }));
}
