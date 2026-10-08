import type { Metadata } from 'next';
import { signOutHost } from '../../auth/actions';
import { requireHost } from '../../lib/server/host';

export const metadata: Metadata = { title: 'Dashboard · Teckin' };

/**
 * The host's home. For now it shows who is signed in and their organisation's question sets;
 * the set editor, recent games and "New game" arrive in the next milestones.
 */
export default async function DashboardPage() {
  const host = await requireHost('/dashboard');
  const questionSets = await host.data.questionSets.list();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="organisation-name">
            {host.membership.organisationName}
          </h1>
          <p className="text-ink-muted" data-testid="signed-in-email">
            {host.email}
          </p>
        </div>
        <form action={signOutHost}>
          <button
            type="submit"
            className="min-h-touch rounded-2xl border-2 border-ink-muted/40 px-5 font-semibold"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="question-sets-heading">
        <h2 id="question-sets-heading" className="text-xl font-bold">
          Question sets
        </h2>
        {questionSets.length === 0 ? (
          <p className="text-ink-muted" data-testid="no-question-sets">
            No question sets yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {questionSets.map((set) => (
              <li key={set.id} className="rounded-2xl bg-surface-raised px-4 py-3">
                <span className="font-semibold">{set.title}</span>{' '}
                <span className="text-ink-muted">· {set._count.questions} questions</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
