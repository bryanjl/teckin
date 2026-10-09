import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signInWithEmail, signInWithProvider } from '../../auth/actions';
import { readAuthEnvironment, signInMethods } from '../../auth/auth-environment';
import { safeReturnPath } from '../../auth/return-path';
import { currentHost } from '../../lib/server/host';

export const metadata: Metadata = { title: 'Sign in · Teckin' };

/** What each error code from Auth.js or our own actions means to a host. */
const errorMessages: Record<string, string> = {
  InvalidEmail: 'Enter an email address like name@school.org.',
  Verification: 'That sign-in link has expired or was already used. Ask for a new one below.',
  EmailUnavailable: 'Sign-in by email is not available here.',
  ProviderUnavailable: 'That sign-in option is not available here.',
  EmailNotSent: 'We could not send the sign-in email. Wait a few minutes, then try again.',
  TooManyAttempts: 'Too many sign-in attempts. Wait 15 minutes, then try again.',
  OAuthAccountNotLinked:
    'That email already signs in another way. Use the method you used the first time.',
};
const fallbackErrorMessage = 'Sign-in did not work. Please try again.';

const inputClass =
  'min-h-touch w-full rounded-2xl border-2 border-ink-muted/40 bg-surface-raised px-4 text-lg text-ink outline-none focus:border-accent';
const primaryButtonClass =
  'min-h-touch w-full rounded-2xl bg-accent px-6 text-xl font-bold text-accent-ink';
const providerButtonClass =
  'min-h-touch w-full rounded-2xl border-2 border-ink-muted/40 bg-surface-raised px-6 text-lg font-semibold text-ink';

/**
 * Host sign-in: email magic link first (works with no external accounts), then Google and
 * Microsoft when this deployment has them. Signing in for the first time creates the account.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { callbackUrl, error, new: newHost } = await searchParams;
  const returnPath = safeReturnPath(callbackUrl);
  if (await currentHost()) redirect(returnPath);

  const methods = signInMethods(readAuthEnvironment());
  const errorCode = typeof error === 'string' ? error : null;
  const anyMethod = methods.email || methods.google || methods.microsoft;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold">
          {newHost === '1' ? 'Create your host account' : 'Sign in to host'}
        </h1>
        <p className="text-ink-muted">
          {newHost === '1'
            ? 'Enter your email and we will send you a sign-in link. No password needed.'
            : 'New here? Signing in creates your account.'}
        </p>
      </header>

      {errorCode ? (
        <p role="alert" data-testid="sign-in-problem" className="text-center text-lg text-danger">
          {errorMessages[errorCode] ?? fallbackErrorMessage}
        </p>
      ) : null}

      {methods.email ? (
        <form action={signInWithEmail} className="flex flex-col gap-4" data-testid="email-sign-in">
          <input type="hidden" name="callbackUrl" value={returnPath} />
          <label htmlFor="sign-in-email" className="text-lg">
            Email address
          </label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            className={inputClass}
          />
          <button type="submit" className={primaryButtonClass}>
            Email me a sign-in link
          </button>
        </form>
      ) : null}

      {methods.google || methods.microsoft ? (
        <form action={signInWithProvider} className="flex flex-col gap-3">
          <input type="hidden" name="callbackUrl" value={returnPath} />
          {methods.email ? <p className="text-center text-ink-muted">or</p> : null}
          {methods.google ? (
            <button type="submit" name="provider" value="google" className={providerButtonClass}>
              Continue with Google
            </button>
          ) : null}
          {methods.microsoft ? (
            <button type="submit" name="provider" value="microsoft" className={providerButtonClass}>
              Continue with Microsoft
            </button>
          ) : null}
        </form>
      ) : null}

      {anyMethod ? null : (
        <p className="text-center text-lg text-ink-muted" data-testid="sign-in-unavailable">
          Sign-in is not set up on this server yet.
        </p>
      )}

      <p className="text-center text-ink-muted">
        By signing in you agree to the{' '}
        <Link href="/terms" className="underline">
          terms
        </Link>{' '}
        and the{' '}
        <Link href="/privacy" className="underline">
          privacy notice
        </Link>
        .
      </p>
    </main>
  );
}
