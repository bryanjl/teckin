import type {
  PlayerRanking,
  PlayerStanding,
  RoomStateView,
  StateMapView,
} from '@teckin/game-contracts';
import { climberPlayerVariants } from '../theme';

/** One climber in the room's synchronised state, as clients read it. */
export interface ClimberProgressView {
  /** Feet, world pixels. */
  readonly x: number;
  readonly y: number;
  readonly heightMetres: number;
  readonly bestHeightMetres: number;
  readonly summitsReached: number;
  readonly finished: boolean;
  /** Live rank from 1; frozen when the game ends. */
  readonly rank: number;
  readonly answered: number;
  readonly correct: number;
}

/** The Climber room's synchronised state as clients read it (no server types needed). */
export interface ClimberRoomStateView extends RoomStateView {
  readonly climbers: StateMapView<ClimberProgressView>;
  readonly summitCount: number;
  /** Player id of the winner once the game has ended, else empty. */
  readonly winnerId: string;
  /** The host's checkpoints setting. */
  readonly checkpointsEnabled: boolean;
}

/** True when `state` looks like a Climber room's state (it has climbers and a roster). */
export function isClimberRoomState(state: unknown): state is ClimberRoomStateView {
  if (typeof state !== 'object' || state === null) return false;
  const candidate = state as Partial<ClimberRoomStateView>;
  return (
    typeof candidate.phase === 'string' &&
    typeof candidate.climbers?.forEach === 'function' &&
    typeof candidate.players?.forEach === 'function'
  );
}

/**
 * The host's checkpoints setting from a room state, or `false` when the state is missing
 * or is not a Climber room's (checkpoints are off by default).
 */
export function checkpointsSettingOf(state: unknown): boolean {
  return isClimberRoomState(state) && state.checkpointsEnabled === true;
}

/** One row of the Climber's ranking with everything the results and host screens show. */
export interface ClimberStandingRow extends PlayerStanding {
  heightMetres: number;
  bestHeightMetres: number;
  summitsReached: number;
  finished: boolean;
  answered: number;
  correct: number;
  /** Correct answers over answered, 0 to 1 (0 with nothing answered). */
  accuracy: number;
  isWinner: boolean;
}

/** Formats an accuracy from 0 to 1 as a whole percentage, or a dash with nothing answered. */
export function formatAccuracy(answered: number, correct: number): string {
  return answered === 0 ? '–' : `${Math.round((correct / answered) * 100)}%`;
}

/**
 * The room's ranking as the server decided it, best first, with nicknames from the roster.
 * Removed players have already left `climbers`, so they never appear.
 */
export function climberStandings(state: ClimberRoomStateView): ClimberStandingRow[] {
  const rows: ClimberStandingRow[] = [];
  state.climbers.forEach((climber, playerId) => {
    const player = state.players.get(playerId);
    if (!player || player.removed) return;
    const summits = `${climber.summitsReached} ${climber.summitsReached === 1 ? 'summit' : 'summits'}`;
    rows.push({
      playerId,
      rank: climber.rank,
      nickname: player.nickname,
      scoreLabel: climber.finished ? 'Top!' : `${climber.heightMetres} m`,
      detail: `${summits} · best ${climber.bestHeightMetres} m · ${formatAccuracy(climber.answered, climber.correct)}`,
      heightMetres: climber.heightMetres,
      bestHeightMetres: climber.bestHeightMetres,
      summitsReached: climber.summitsReached,
      finished: climber.finished,
      answered: climber.answered,
      correct: climber.correct,
      accuracy: climber.answered === 0 ? 0 : climber.correct / climber.answered,
      isWinner: state.winnerId === playerId,
    });
  });
  // Ranks start at 0 for a moment after joining; those sort last, in join order.
  return rows.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
}

/** The Climber's ranking in the shape the game contract's `rankPlayers` returns. */
export function rankClimberPlayers(state: ClimberRoomStateView): PlayerRanking[] {
  return climberStandings(state).map(({ playerId, rank, scoreLabel }) => ({
    playerId,
    rank,
    scoreLabel,
  }));
}

/** One player's report columns, in the shape the game contract's `summarisePlayer` returns. */
export function summariseClimber(
  state: ClimberRoomStateView,
  playerId: string,
): Record<string, number | string> {
  const climber = state.climbers.get(playerId);
  if (!climber) return {};
  return {
    rank: climber.rank,
    heightMetres: climber.heightMetres,
    bestHeightMetres: climber.bestHeightMetres,
    summitsReached: climber.summitsReached,
    questionsAnswered: climber.answered,
    accuracy: formatAccuracy(climber.answered, climber.correct),
  };
}

/**
 * The player colour for a player id: a stable pick from the theme's variants, so everyone in
 * a room sees each climber in the same colour on every screen.
 */
export function climberVariantFor(playerId: string): (typeof climberPlayerVariants)[number] {
  let hash = 2166136261;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const variants = climberPlayerVariants;
  return variants[(hash >>> 0) % variants.length]!;
}

/** English ordinal for a rank: 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function formatRank(rank: number): string {
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}
