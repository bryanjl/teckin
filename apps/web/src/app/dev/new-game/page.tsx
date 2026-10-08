import type { Metadata } from 'next';
import { NewGameForm } from './new-game-form';

export const metadata: Metadata = {
  title: 'New game (dev) · Teckin',
  robots: { index: false, follow: false },
};

/**
 * Temporary game creation for Phase 3: makes a game on the realtime server with the dev
 * secret (the realtime server's `DEV_GAME_SECRET`) and gives basic host controls until the
 * host live screen arrives. Phase 4 replaces it with signed-in hosts.
 */
export default function NewGamePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-bold">New game (dev only)</h1>
      <NewGameForm />
    </main>
  );
}
