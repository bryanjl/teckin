import Link from 'next/link';
import { climberDisplayName } from '@teckin/climber';

/** Temporary home page until the landing page arrives in Phase 4. */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="text-4xl font-bold">Teckin</h1>
      <p className="text-ink-muted">Live, question-powered classroom games.</p>
      <Link
        href="/play/solo"
        className="flex min-h-touch items-center rounded-2xl bg-accent px-8 text-lg font-semibold text-accent-ink"
      >
        Play {climberDisplayName} solo
      </Link>
    </main>
  );
}
