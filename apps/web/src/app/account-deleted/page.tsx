import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Account deleted · Teckin' };

/** Where a host lands after deleting their account. */
export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold" data-testid="account-deleted">
        Your account is deleted
      </h1>
      <p>
        Your account, your question sets, your games and your players&apos; answers have been
        removed.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-touch items-center text-accent underline underline-offset-4"
      >
        Back to the home page
      </Link>
    </main>
  );
}
