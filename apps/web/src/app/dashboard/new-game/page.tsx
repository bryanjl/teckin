import { questionSetReadiness } from '@teckin/questions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { registeredGames } from '../../../games/registry';
import { gameChoicesFor, roomSettingsFields } from '../../../lib/game-launch';
import { requireHost } from '../../../lib/server/host';
import { NewGameForm } from './new-game-form';

export const metadata: Metadata = { title: 'New game · Teckin' };

/**
 * "New game": pick a game from the registry, pick a set that is ready, adjust the settings
 * (generated from the game's schema) and launch. Phone first, like the rest of the dashboard.
 */
export default async function NewGamePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const host = await requireHost('/dashboard/new-game');
  const [sets, { set: requestedSet }] = await Promise.all([
    host.data.questionSets.list(),
    searchParams,
  ]);
  const playable = sets
    .filter((set) => questionSetReadiness(set._count.questions).playable)
    .map((set) => ({ id: set.id, title: set.title, questionCount: set._count.questions }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <nav>
        <Link
          href="/dashboard"
          className="inline-flex min-h-touch items-center text-lg font-semibold text-accent underline-offset-4 hover:underline"
        >
          ← Dashboard
        </Link>
      </nav>
      <h1 className="text-3xl font-bold">New game</h1>
      {playable.length === 0 ? (
        <p className="text-lg text-ink-muted" data-testid="no-playable-sets">
          A game needs a question set with at least 5 questions.{' '}
          <Link href="/dashboard/sets/new" className="text-accent underline underline-offset-4">
            Write one
          </Link>
          .
        </p>
      ) : (
        <NewGameForm
          games={gameChoicesFor(registeredGames)}
          roomFields={roomSettingsFields()}
          sets={playable}
          initialSetId={typeof requestedSet === 'string' ? requestedSet : undefined}
        />
      )}
    </main>
  );
}
