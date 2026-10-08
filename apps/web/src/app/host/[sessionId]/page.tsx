import type { Metadata } from 'next';
import { HostScreen } from './host-screen';

export const metadata: Metadata = {
  title: 'Host screen · Teckin',
  robots: { index: false, follow: false },
};

/**
 * The live host screen of one game, built for a laptop or projector: code, QR and lobby;
 * then the game's live view, leaderboard, timer and controls; then the final ranking.
 */
export default async function HostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <HostScreen sessionId={sessionId} />;
}
