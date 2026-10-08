import { questionSetSchema } from '@teckin/questions';
import { z } from 'zod';
import { roomSettingsSchema } from './room-protocol';

/**
 * How the web app launches a game on the realtime server. The web app signs the request with
 * the secret both apps share (`signRequest` in `@teckin/room-core/realtime-trust`), so only it
 * can create rooms; it has already checked the signed-in host and copied their question set.
 */

/** Route on the realtime server that creates a game's room. */
export const launchGamePath = '/games';

/** Purpose the launch request is signed for, so no other signed request passes as one. */
export const launchGamePurpose = 'launch-game';

/** The signed body of a launch request. */
export const launchGameRequestSchema = z.object({
  /** A registered game id, for example "climber". */
  gameId: z.string().min(1).max(64),
  /** The game's record in the web app's database. */
  gameSessionId: z.string().min(1).max(64),
  /** The organisation that owns the game; only its hosts can control the room. */
  organisationId: z.string().min(1).max(64),
  settings: roomSettingsSchema,
  /** The game's own settings; the realtime server validates them with the game's schema. */
  gameSettings: z.record(z.string(), z.unknown()),
  /** The host's question set, copied when the game launched. */
  questionSet: questionSetSchema,
});

/** What the web app asks the realtime server to create. */
export type LaunchGameRequest = z.infer<typeof launchGameRequestSchema>;

/** The realtime server's answer to a launch. */
export interface LaunchedGame {
  roomId: string;
  joinCode: string;
}
