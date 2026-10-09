import type { Metadata } from 'next';
import { LegalPage, Placeholder } from '../../site/legal-page';

export const metadata: Metadata = { title: 'Privacy · Teckin' };

const sectionHeading = 'pt-2 text-2xl font-bold';
const list = 'flex list-disc flex-col gap-2 pl-6';

/** Privacy notice. Placeholder text: the facts match how the product works; the legal frame does not exist yet. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="[PLACEHOLDER: date]">
      <p>
        Teckin is run by <Placeholder>operator name and registered address</Placeholder>. Contact us
        about privacy at <Placeholder>privacy contact email</Placeholder>.
      </p>

      <h2 className={sectionHeading}>Players</h2>
      <p>
        Players are often children, so the game is built to know as little about them as possible.
      </p>
      <ul className={list}>
        <li>
          Players never create an account. We never ask a player for a real name, email address,
          age, photo or location.
        </li>
        <li>
          A player types a nickname (or picks a random one). Nicknames pass a filter, and the host
          can rename or remove any player.
        </li>
        <li>
          During a game we record each player&apos;s nickname, the answers they choose, how long
          they took and their final result. This belongs to the host&apos;s organisation and is used
          only for that host&apos;s reports.
        </li>
        <li>
          The player&apos;s browser keeps a random device key so a phone that locks or reloads can
          rejoin its game. We store it only in scrambled (hashed) form and clear it when the game
          ends.
        </li>
        <li>
          Player answers and results are deleted automatically 12 months after the game (or sooner
          if the operator sets a shorter period).
        </li>
        <li>There are no adverts, no third-party trackers and no chat between players.</li>
      </ul>

      <h2 className={sectionHeading}>Hosts</h2>
      <ul className={list}>
        <li>
          To host games you sign in with your email address, or with Google or Microsoft where
          offered. We keep your email address, and the name and picture that provider shares, to run
          your account.
        </li>
        <li>
          Your question sets, games and reports belong to your organisation. Nobody outside it can
          see them.
        </li>
        <li>A single cookie keeps you signed in. We set no advertising or analytics cookies.</li>
        <li>
          You can delete your account at any time from Account in the dashboard. That deletes your
          organisation and everything in it: question sets, games, players&apos; answers and
          reports.
        </li>
      </ul>

      <h2 className={sectionHeading}>Service data</h2>
      <p>
        Our servers keep technical logs (errors, timings, request details) for up to 30 days to keep
        the service running. Network addresses are masked in our monitoring, and nicknames are never
        logged together with addresses. We also use network addresses briefly to limit repeated
        sign-in and join attempts.
      </p>
      <p>
        The service runs on Microsoft Azure in{' '}
        <Placeholder>region, e.g. the United Kingdom</Placeholder>. Sign-in emails are sent through
        Azure Communication Services.
      </p>

      <h2 className={sectionHeading}>Your rights</h2>
      <p>
        <Placeholder>
          Legal basis for processing, data controller and processor roles for schools, rights of
          access, correction and deletion, how to complain to the regulator (for example the ICO in
          the UK), and the applicable law
        </Placeholder>
      </p>
    </LegalPage>
  );
}
