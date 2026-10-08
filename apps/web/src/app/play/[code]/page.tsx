import type { Metadata } from 'next';
import { NetworkGame } from './network-game';

export const metadata: Metadata = { title: 'Live climb · Teckin' };

/** A live multiplayer game, reached from `/join` (or reloaded: the device key rejoins). */
export default async function LivePlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <NetworkGame code={code} />;
}
