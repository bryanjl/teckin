import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from './site-footer';

/**
 * Frame of the privacy and terms pages. Their text is a placeholder written during the build;
 * the banner says so until the operator replaces it with reviewed wording.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="flex min-h-touch items-center self-start font-semibold text-accent"
        >
          ← Teckin
        </Link>
        <p
          role="note"
          data-testid="placeholder-notice"
          className="rounded-2xl border-2 border-accent bg-accent/10 p-4 font-semibold text-accent"
        >
          PLACEHOLDER TEXT. This page was drafted during the build and has not been reviewed by a
          lawyer. Replace everything marked [PLACEHOLDER] before the site is used by real schools.
        </p>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-ink-muted">Last updated: {updated}</p>
        <div className="legal-text flex flex-col gap-4 text-lg leading-relaxed">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

/** A marked gap the operator must fill in, shown in the accent colour. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-accent/20 px-1 text-accent">[PLACEHOLDER: {children}]</mark>;
}
