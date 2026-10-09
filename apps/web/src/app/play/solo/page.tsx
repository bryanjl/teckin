import type { Metadata } from 'next';
import { connection } from 'next/server';
import { SoloGame } from './solo-game';

export const metadata: Metadata = { title: 'Solo climb · Teckin' };

/** Solo play page: a full-screen Climber game, loaded client-side only. */
export default async function SoloPlayPage() {
  // Rendered per request so the Content Security Policy nonce (src/proxy.ts) reaches its scripts.
  await connection();
  return <SoloGame />;
}
