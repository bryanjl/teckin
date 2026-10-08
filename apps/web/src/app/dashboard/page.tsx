import { questionSetReadiness } from '@teckin/questions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { signOutHost } from '../../auth/actions';
import { gameDisplayName } from '../../games/registry';
import { requireHost } from '../../lib/server/host';
import { csvTemplatePath } from './sets/csv-template-path';
import { buttonClass, primaryButtonClass } from './sets/editor-styles';

export const metadata: Metadata = { title: 'Dashboard · Teckin' };

const statusLabels: Record<string, string> = {
  lobby: 'Waiting to start',
  playing: 'Playing now',
  ended: 'Finished',
};

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const linkButton = 'inline-flex items-center justify-center text-center';

/**
 * The host's home, phone first: "New game" at the top, then their question sets (each opens
 * the editor) and their most recent games.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const host = await requireHost('/dashboard');
  const [questionSets, recentGames, { deleted }] = await Promise.all([
    host.data.questionSets.list(),
    host.data.gameSessions.list({ take: 5 }),
    searchParams,
  ]);
  const playableCount = questionSets.filter(
    (set) => questionSetReadiness(set._count.questions).playable,
  ).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold" data-testid="organisation-name">
            {host.membership.organisationName}
          </h1>
          <p className="truncate text-ink-muted" data-testid="signed-in-email">
            {host.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/account" className={`${buttonClass} ${linkButton}`}>
            Account
          </Link>
          <form action={signOutHost}>
            <button type="submit" className={buttonClass}>
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <Link
          href="/dashboard/new-game"
          data-testid="new-game"
          className={`${primaryButtonClass} ${linkButton} min-h-touch-large text-2xl`}
        >
          New game
        </Link>
        {playableCount === 0 ? (
          <p className="text-center text-ink-muted" data-testid="new-game-hint">
            A game needs a question set with at least 5 questions.
          </p>
        ) : null}
      </section>

      {deleted === '1' ? (
        <p
          role="status"
          className="rounded-2xl bg-surface-raised px-4 py-3"
          data-testid="set-deleted"
        >
          Question set deleted.
        </p>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="question-sets-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="question-sets-heading" className="text-xl font-bold">
            Question sets
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <Link href="/dashboard/sets/new" className={`${buttonClass} ${linkButton}`}>
            + New set
          </Link>
          <Link href="/dashboard/sets/new?import=1" className={`${buttonClass} ${linkButton}`}>
            Import from CSV
          </Link>
        </div>
        {questionSets.length === 0 ? (
          <div className="flex flex-col gap-2 text-ink-muted" data-testid="no-question-sets">
            <p>No question sets yet. Write one, or import questions from a spreadsheet.</p>
            <p>
              <a
                href={csvTemplatePath}
                download
                className="text-accent underline underline-offset-4"
              >
                Download the CSV template
              </a>
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="question-set-list">
            {questionSets.map((set) => {
              const count = set._count.questions;
              const readiness = questionSetReadiness(count);
              return (
                <li key={set.id}>
                  <Link
                    href={`/dashboard/sets/${set.id}`}
                    data-testid="question-set"
                    className="flex min-h-touch flex-col gap-1 rounded-2xl bg-surface-raised px-4 py-3 focus-visible:outline-3 focus-visible:outline-accent"
                  >
                    <span className="break-words text-lg font-semibold">{set.title}</span>
                    <span className="text-sm text-ink-muted">
                      {count === 1 ? '1 question' : `${count} questions`} · edited{' '}
                      {shortDate.format(set.updatedAt)}
                      {readiness.playable ? null : (
                        <span className="text-accent">
                          {' '}
                          · needs {readiness.questionsNeeded} more to play
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="recent-games-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recent-games-heading" className="text-xl font-bold">
            Recent games
          </h2>
          <Link
            href="/dashboard/games"
            className="inline-flex min-h-touch items-center text-accent underline underline-offset-4"
            data-testid="past-games-link"
          >
            Past games
          </Link>
        </div>
        {recentGames.length === 0 ? (
          <p className="text-ink-muted" data-testid="no-recent-games">
            No games yet. Games you run will show here, with their reports.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="recent-games">
            {recentGames.map((game) => (
              <li
                key={game.id}
                className="flex flex-col gap-1 rounded-2xl bg-surface-raised px-4 py-3"
              >
                {game.status !== 'ended' && game.roomId ? (
                  <Link
                    href={`/host/${game.id}`}
                    className="inline-flex min-h-touch items-center text-lg font-semibold text-accent underline underline-offset-4"
                    data-testid="recent-game-host-link"
                  >
                    {gameDisplayName(game.gameType)} · open host screen
                  </Link>
                ) : game.status === 'ended' ? (
                  <Link
                    href={`/dashboard/games/${game.id}`}
                    className="inline-flex min-h-touch items-center text-lg font-semibold text-accent underline underline-offset-4"
                    data-testid="recent-game-report-link"
                  >
                    {gameDisplayName(game.gameType)} · report
                  </Link>
                ) : (
                  <span className="text-lg font-semibold">{gameDisplayName(game.gameType)}</span>
                )}
                <span className="text-sm text-ink-muted">
                  {statusLabels[game.status] ?? game.status} · {shortDate.format(game.createdAt)} ·{' '}
                  {game._count.participants === 1
                    ? '1 player'
                    : `${game._count.participants} players`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
