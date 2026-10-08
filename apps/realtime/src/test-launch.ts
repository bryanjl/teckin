import { randomUUID } from 'node:crypto';
import {
  launchGamePath,
  launchGamePurpose,
  roomSettingsSchema,
  type LaunchedGame,
  type LaunchGameRequest,
} from '@teckin/game-contracts';
import { sampleQuestionSets } from '@teckin/questions';
import { signRequest } from '@teckin/room-core/realtime-trust';

/** Organisation the tests and the load test launch games for. */
export const testLaunchOrganisationId = 'organisation-for-realtime-tests';

/**
 * Launches a game the way the web app does (a signed `POST /games`), with a bundled sample
 * set. For tests and the load test only.
 */
export async function launchTestGame(
  baseUrl: string,
  sharedSecret: string,
  overrides: Partial<LaunchGameRequest> = {},
): Promise<Response> {
  const request: LaunchGameRequest = {
    gameId: 'climber',
    gameSessionId: randomUUID(),
    organisationId: testLaunchOrganisationId,
    settings: roomSettingsSchema.parse({}),
    gameSettings: {},
    questionSet: sampleQuestionSets.maths,
    ...overrides,
  };
  return fetch(`${baseUrl}${launchGamePath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signRequest(sharedSecret, launchGamePurpose, request)),
  });
}

/** {@link launchTestGame}, expecting success. */
export async function launchTestGameOrThrow(
  baseUrl: string,
  sharedSecret: string,
  overrides: Partial<LaunchGameRequest> = {},
): Promise<LaunchedGame> {
  const response = await launchTestGame(baseUrl, sharedSecret, overrides);
  if (response.status !== 201) throw new Error(`Launch failed with ${response.status}`);
  return (await response.json()) as LaunchedGame;
}
