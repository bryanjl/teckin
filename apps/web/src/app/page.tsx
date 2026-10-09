import Link from 'next/link';
import { climberDisplayName } from '@teckin/climber';
import { SiteFooter } from '../site/site-footer';

const primaryButton =
  'flex min-h-touch items-center justify-center rounded-2xl bg-accent px-8 text-xl font-bold text-accent-ink';
const secondaryButton =
  'flex min-h-touch items-center justify-center rounded-2xl border-2 border-ink-muted/40 px-6 text-lg font-semibold text-ink';

/** The steps a new host takes, in the order they take them. */
const steps = [
  {
    title: 'Write your questions',
    text: 'Multiple choice or true/false, typed on your phone or imported from a spreadsheet.',
  },
  {
    title: 'Launch a game',
    text: 'Pick a game and a question set, set the length, and show the join code on the board.',
  },
  {
    title: 'Players climb',
    text: 'Right answers fill their energy, and energy powers every jump up the tower.',
  },
  {
    title: 'Read the report',
    text: 'See who answered what, and which questions the class found hardest.',
  },
];

/** Public landing page: what Teckin is, sign-up for hosts, and the way in for players. */
export default function HomePage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 pt-[max(2rem,env(safe-area-inset-top))]">
        <section className="flex flex-col items-center gap-6 text-center" aria-labelledby="hero">
          <TowerIllustration />
          <h1 id="hero" className="text-4xl font-bold sm:text-5xl">
            Teckin
          </h1>
          <p className="max-w-xl text-xl text-ink-muted">
            Live classroom games powered by your questions. In {climberDisplayName}, every right
            answer gives players the energy to climb, and the first to the top wins.
          </p>
          <div className="flex w-full max-w-sm flex-col gap-3">
            <Link href="/sign-in?new=1" className={primaryButton} data-testid="sign-up-link">
              Sign up free
            </Link>
            <Link href="/join" className={secondaryButton}>
              Join a game
            </Link>
            <Link href="/play/solo" className={secondaryButton}>
              Try a solo climb
            </Link>
          </div>
          <p className="text-ink-muted">
            Already hosting?{' '}
            <Link href="/sign-in" className="font-semibold text-accent underline">
              Sign in
            </Link>
          </p>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-2xl font-bold">
            How it works
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-2xl bg-surface-raised p-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-ink"
                >
                  {index + 1}
                </span>
                <span className="flex flex-col gap-1">
                  <strong className="text-lg">{step.title}</strong>
                  <span className="text-ink-muted">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="flex flex-col gap-3 rounded-2xl border-2 border-ink-muted/30 p-5"
          aria-labelledby="players"
        >
          <h2 id="players" className="text-2xl font-bold">
            Made for children&apos;s privacy
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-6 text-lg text-ink-muted">
            <li>Players join with a code and a nickname. No accounts, no emails, no real names.</li>
            <li>Nicknames are filtered, and hosts can rename or remove any player.</li>
            <li>No adverts, no trackers, no chat between players.</li>
            <li>Players&apos; answers are deleted automatically after 12 months.</li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

/** A small original drawing of the climb: a tower with ledges and players rising. */
function TowerIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      className="h-32 w-auto"
      role="img"
      aria-label="Climbers racing up a tower"
    >
      <rect x="50" y="8" width="60" height="112" rx="6" fill="#1e293b" />
      <rect x="56" y="96" width="22" height="5" rx="2" fill="#cbd5e1" />
      <rect x="82" y="74" width="22" height="5" rx="2" fill="#cbd5e1" />
      <rect x="56" y="52" width="22" height="5" rx="2" fill="#cbd5e1" />
      <rect x="82" y="30" width="22" height="5" rx="2" fill="#cbd5e1" />
      <path d="M72 8 L80 0 L88 8 Z" fill="#f59e0b" />
      <circle cx="67" cy="89" r="5" fill="#22c55e" />
      <circle cx="93" cy="67" r="5" fill="#38bdf8" />
      <circle cx="67" cy="45" r="5" fill="#f59e0b" />
      <circle cx="93" cy="23" r="5" fill="#f472b6" />
    </svg>
  );
}
