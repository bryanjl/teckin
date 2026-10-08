import type { Metadata } from 'next';
import Link from 'next/link';
import { gameDisplayName } from '../../../games/registry';
import { requireHost } from '../../../lib/server/host';

export const metadata: Metadata = { title: 'Past games · Teckin' };

const playedOn = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Every finished game of the host's organisation, newest first, each opening its report. */
export default async function PastGamesPage() {
  const host = await requireHost('/dashboard/games');
  const games = await host.data.gameSessions.listPast();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-2">
        <Link
          href="/dashboard"
          className="inline-flex min-h-touch items-center self-start text-accent underline underline-offset-4"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Past games</h1>
      </header>
      {games.length === 0 ? (
        <p className="text-ink-muted" data-testid="no-past-games">
          No finished games yet. When a game ends, its report appears here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="past-games">
          {games.map((game) => {
            const players = game._count.participants;
            return (
              <li key={game.id}>
                <Link
                  href={`/dashboard/games/${game.id}`}
                  data-testid="past-game"
                  className="flex min-h-touch flex-col gap-1 rounded-2xl bg-surface-raised px-4 py-3 focus-visible:outline-3 focus-visible:outline-accent"
                >
                  <span className="break-words text-lg font-semibold">
                    {gameDisplayName(game.gameType)} · {game.questionSet?.title ?? 'Deleted set'}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {playedOn.format(game.endedAt ?? game.createdAt)} ·{' '}
                    {game.playerDataDeletedAt
                      ? 'player answers deleted'
                      : players === 1
                        ? '1 player'
                        : `${players} players`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
