import type { Metadata } from 'next';
import { connection } from 'next/server';
import { NetworkGame } from './network-game';

export const metadata: Metadata = { title: 'Live climb · Teckin' };

/** A live multiplayer game, reached from `/join` (or reloaded: the device key rejoins). */
export default async function LivePlayPage({ params }: { params: Promise<{ code: string }> }) {
  // Rendered per request so the Content Security Policy nonce (src/proxy.ts) reaches its scripts.
  await connection();
  const { code } = await params;
  return <NetworkGame code={code} />;
}
