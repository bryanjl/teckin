'use server';

import { checkPlanAllows, playersAllowedInGame, RecordNotFoundError } from '@teckin/db';
import { questionSetReadiness } from '@teckin/questions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { registeredGames } from '../../../games/registry';
import {
  questionSetFromSnapshot,
  readNewGameForm,
  type LaunchSnapshot,
} from '../../../lib/game-launch';
import { requireHost } from '../../../lib/server/host';
import { planLimits } from '../../../lib/server/platform';
import { launchOnRealtime } from '../../../lib/server/realtime';

/** What the New game form shows after a refused launch. */
export interface LaunchGameState {
  /** Problems by input name (`game.x`, `room.y`, `gameId`, `questionSetId`). */
  problems: Record<string, string>;
  /** A problem with the launch as a whole. */
  message: string | null;
  /** What was submitted, so the form keeps the host's choices. */
  submitted: Record<string, string>;
}

const launchMessages = {
  notConfigured:
    'Games cannot start yet: the game server is not set up (REALTIME_SHARED_SECRET is missing).',
  unreachable: 'Could not reach the game server. Try again in a moment.',
  refused: 'The game server could not start this game. Try again in a moment.',
} as const;

/**
 * Launches a game for the signed-in host: copies their question set into a new game record
 * (the snapshot), creates the realtime room tied to their organisation, and opens the host
 * screen. Everything the form sends is checked again here.
 */
export async function launchGame(
  _previous: LaunchGameState,
  form: FormData,
): Promise<LaunchGameState> {
  const host = await requireHost('/dashboard/new-game');
  const submitted: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') submitted[name] = value;
  }
  const refused = (problems: Record<string, string>, message: string | null = null) => ({
    problems,
    message,
    submitted,
  });

  const submission = readNewGameForm(form, registeredGames);
  if (!submission.ok) return refused(submission.problems, 'Check the highlighted settings.');
  const plan = await checkPlanAllows(host.data, planLimits, 'liveGames');
  if (!plan.allowed) {
    return refused({}, `Your plan allows ${plan.limit} games at once. End a running game first.`);
  }
  const { planKey } = await host.data.organisation.get();
  const roomSettings = {
    ...submission.roomSettings,
    maxPlayers: playersAllowedInGame(
      submission.roomSettings.maxPlayers,
      planLimits.forPlan(planKey),
    ),
  };

  let game;
  try {
    game = await host.data.gameSessions.create({
      gameType: submission.gameId,
      questionSetId: submission.questionSetId,
      settings: { room: roomSettings, game: submission.gameSettings } as never,
      hostUserId: host.userId,
    });
  } catch (error) {
    if (error instanceof RecordNotFoundError) {
      return refused({ questionSetId: 'That question set no longer exists.' });
    }
    throw error;
  }

  const snapshot = game.questionSnapshot as unknown as LaunchSnapshot;
  if (!questionSetReadiness(snapshot.questions.length).playable) {
    await host.data.gameSessions.delete(game.id);
    return refused({ questionSetId: 'A set needs at least 5 questions for a game.' });
  }

  const launched = await launchOnRealtime({
    gameId: submission.gameId,
    gameSessionId: game.id,
    organisationId: host.membership.organisationId,
    settings: roomSettings,
    gameSettings: submission.gameSettings,
    questionSet: questionSetFromSnapshot(snapshot),
  });
  if (!launched.ok) {
    // Nothing was played, so the record would only clutter the dashboard.
    await host.data.gameSessions.delete(game.id);
    return refused({}, launchMessages[launched.problem]);
  }
  await host.data.gameSessions.attachRoom(game.id, launched.game.roomId);
  revalidatePath('/dashboard');
  redirect(`/host/${encodeURIComponent(game.id)}`);
}
