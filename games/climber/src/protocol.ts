import { z } from 'zod';

/**
 * Climber-specific messages between a player's device and the room. Questions and energy
 * use the shared session protocol in `@teckin/game-contracts`.
 */

/** Messages a player sends. */
export const climberClientMessageTypes = {
  /** About ten times a second: where the player's feet are (a {@link MoveReport}). */
  move: 'climber:move',
  /** The player used "Back to checkpoint". */
  respawn: 'climber:respawn',
} as const;

/** Messages the room sends to one player. */
export const climberServerMessageTypes = {
  /** The room refused a position; the player is put back where it last agreed (a {@link Correction}). */
  correction: 'climber:correction',
} as const;

/** Requests a player sends. */
export const climberRequestTypes = {
  /** Where the room has the player, for a device that (re)joins: a {@link ClimberPlacement}. */
  placement: 'climber:placement',
} as const;

const coordinate = z.number().finite().min(-100_000).max(100_000);

/** A position report. Coordinates are the feet, world pixels. */
export const moveReportSchema = z
  .object({
    /** Increases with every report. */
    seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    x: coordinate,
    y: coordinate,
    onGround: z.boolean(),
    /** Summits the device counts as reached. The room checks each one itself. */
    summits: z.number().int().min(0).max(64),
    /** The last correction the device applied; reports from before it are ignored. */
    correctionId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

/** A position report from a player. */
export type MoveReport = z.infer<typeof moveReportSchema>;

/** Where the room has a player. */
export interface ClimberPlacement {
  /** Feet, world pixels. */
  x: number;
  y: number;
  summitsReached: number;
  finished: boolean;
  /** Echo it in later move reports. */
  correctionId: number;
}

/** A refused position: move the player back to this placement. */
export type Correction = ClimberPlacement;
