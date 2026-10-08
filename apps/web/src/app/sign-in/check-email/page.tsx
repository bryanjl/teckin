import type { Metadata } from 'next';
import Link from 'next/link';
import { readAuthEnvironment } from '../../../auth/auth-environment';
import { magicLinkLifetimeSeconds } from '../../../auth/magic-link';

export const metadata: Metadata = { title: 'Check your email · Teckin' };
export const dynamic = 'force-dynamic';

/** Shown after a magic link is sent. Locally it points at the server log instead. */
export default function CheckEmailPage() {
  const linksAreLogged = readAuthEnvironment().magicLinks?.kind === 'log';
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <h1 className="text-3xl font-bold">Check your email</h1>
      <p className="text-lg">
        We sent you a sign-in link. It works once and expires in {magicLinkLifetimeSeconds / 60}{' '}
        minutes.
      </p>
      {linksAreLogged ? (
        <p className="text-ink-muted" data-testid="magic-link-logged">
          Running locally: no email is sent. The link is printed in the web server’s log.
        </p>
      ) : null}
      <Link href="/sign-in" className="text-lg font-semibold text-accent underline">
        Use a different email
      </Link>
    </main>
  );
}
