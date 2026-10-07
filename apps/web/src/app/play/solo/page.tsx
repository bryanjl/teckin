import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Solo climb · Teckin' };

/** Solo play page. The Phaser game is mounted here in milestone M1.2. */
export default function SoloPlayPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center">
      <p data-testid="solo-placeholder">The climb is being built. Check back soon.</p>
    </main>
  );
}
