import type { Metadata } from 'next';
import { LegalPage, Placeholder } from '../../site/legal-page';

export const metadata: Metadata = { title: 'Terms · Teckin' };

const sectionHeading = 'pt-2 text-2xl font-bold';
const list = 'flex list-disc flex-col gap-2 pl-6';

/** Terms of use. Placeholder text to be replaced by reviewed terms before launch. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="[PLACEHOLDER: date]">
      <p>
        These terms are between you and{' '}
        <Placeholder>operator name and registered address</Placeholder>. By hosting or playing a
        game you agree to them.
      </p>

      <h2 className={sectionHeading}>Hosting games</h2>
      <ul className={list}>
        <li>You must be an adult to create a host account.</li>
        <li>
          You are responsible for the questions you write and for the games you run, including
          keeping players&apos; nicknames appropriate (you can rename or remove players).
        </li>
        <li>
          Do not ask players for personal information in questions or nicknames. Players should
          never be asked for real names, contact details or photos.
        </li>
        <li>Do not use the service to break the law or to harm, harass or deceive anyone.</li>
      </ul>

      <h2 className={sectionHeading}>Playing games</h2>
      <ul className={list}>
        <li>Players join with a code from their host and a nickname. No account is needed.</li>
        <li>Please choose a kind nickname. Hosts can rename or remove players.</li>
      </ul>

      <h2 className={sectionHeading}>Your content</h2>
      <p>
        Question sets you write stay yours. You let us store and show them to you and to the players
        of your games so the service works.{' '}
        <Placeholder>licence wording and any content rules</Placeholder>
      </p>

      <h2 className={sectionHeading}>The service</h2>
      <p>
        <Placeholder>
          Availability, changes to the service, pricing and plans, suspension and termination,
          disclaimers, limitation of liability, governing law and how these terms change
        </Placeholder>
      </p>
    </LegalPage>
  );
}
