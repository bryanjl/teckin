import { questionSetReadiness } from '@teckin/questions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireHost } from '../../../lib/server/host';

export const metadata: Metadata = { title: 'New game · Teckin' };

/**
 * Where "New game" leads. M4.3 adds the game list, the settings form and launch; until then
 * this page shows which of the host's sets are ready for a game.
 */
export default async function NewGamePage() {
  const host = await requireHost('/dashboard/new-game');
  const sets = await host.data.questionSets.list();
  const playable = sets.filter((set) => questionSetReadiness(set._count.questions).playable);

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
      <p className="text-lg text-ink-muted" data-testid="new-game-coming">
        Choosing a game, its settings and launching it from here is the next step being built.
      </p>
      <h2 className="text-xl font-bold">Sets ready for a game</h2>
      {playable.length === 0 ? (
        <p className="text-ink-muted" data-testid="no-playable-sets">
          None yet. A set needs at least 5 questions.{' '}
          <Link href="/dashboard/sets/new" className="text-accent underline underline-offset-4">
            Write one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="playable-sets">
          {playable.map((set) => (
            <li key={set.id} className="rounded-2xl bg-surface-raised px-4 py-3">
              <span className="font-semibold">{set.title}</span>{' '}
              <span className="text-ink-muted">· {set._count.questions} questions</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
