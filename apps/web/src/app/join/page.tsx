import type { Metadata } from 'next';
import { normaliseJoinCode } from '../../lib/join';
import { JoinForm } from './join-form';

export const metadata: Metadata = { title: 'Join a game · Teckin' };

/** Players join here: the game code first, then a nickname. `?code=` fills in the code. */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <h1 className="text-center text-3xl font-bold">Join a game</h1>
      <JoinForm initialCode={normaliseJoinCode(typeof code === 'string' ? code : '')} />
    </main>
  );
}
