import type { Metadata } from 'next';
import Link from 'next/link';
import { requireHost } from '../../../lib/server/host';
import { dangerButtonClass, inputClass } from '../sets/editor-styles';
import { deleteAccountAction } from './actions';

export const metadata: Metadata = { title: 'Account · Teckin' };

/** The host's account: who is signed in, and deleting the account with all its data. */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const host = await requireHost('/dashboard/account');
  const { error } = await searchParams;
  const isOwner = host.membership.role === 'owner';

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-2">
        <Link
          href="/dashboard"
          className="inline-flex min-h-touch items-center self-start text-accent underline underline-offset-4"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="break-words text-ink-muted">
          Signed in as {host.email} · {host.membership.organisationName}
        </p>
      </header>

      <section
        className="flex flex-col gap-3 rounded-2xl border-2 border-danger/50 px-4 py-4"
        aria-labelledby="delete-heading"
      >
        <h2 id="delete-heading" className="text-xl font-bold">
          Delete account
        </h2>
        <p>
          {isOwner
            ? `This deletes your account and everything in ${host.membership.organisationName}: question sets, past games, players' answers and reports. It cannot be undone.`
            : 'This deletes your account. The organisation and its data stay with its owner.'}
        </p>
        <p className="text-ink-muted">
          Want a copy first? Download reports from Past games before you delete.
        </p>
        <form action={deleteAccountAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Type DELETE to confirm</span>
            <input
              name="confirmation"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={inputClass}
              aria-invalid={error === 'confirm' ? true : undefined}
              aria-describedby={error === 'confirm' ? 'confirm-error' : undefined}
              data-testid="delete-confirmation"
            />
          </label>
          {error === 'confirm' ? (
            <p
              id="confirm-error"
              role="alert"
              className="text-danger"
              data-testid="delete-confirmation-error"
            >
              Type DELETE in capitals to confirm.
            </p>
          ) : null}
          <button type="submit" className={dangerButtonClass} data-testid="delete-account">
            Delete my account and data
          </button>
        </form>
      </section>
    </main>
  );
}
