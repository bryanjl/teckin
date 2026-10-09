import Link from 'next/link';

/** Footer of the public pages: the legal pages and where players go. */
export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-8 text-ink-muted">
      <Link href="/privacy" className="flex min-h-touch items-center underline">
        Privacy
      </Link>
      <Link href="/terms" className="flex min-h-touch items-center underline">
        Terms
      </Link>
      <Link href="/join" className="flex min-h-touch items-center underline">
        Join a game
      </Link>
      <Link href="/sign-in" className="flex min-h-touch items-center underline">
        Host sign-in
      </Link>
    </footer>
  );
}
