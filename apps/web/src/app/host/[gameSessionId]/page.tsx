import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { gameDisplayName } from '../../../games/registry';
import { requireHost } from '../../../lib/server/host';
import { HostScreen } from './host-screen';

export const metadata: Metadata = {
  title: 'Host screen · Teckin',
  robots: { index: false, follow: false },
};

/**
 * The live host screen of one game, built for a laptop or projector: code, QR and lobby;
 * then the game's live view, leaderboard, timer and controls; then the final ranking. Only
 * hosts in the organisation that launched the game can open it; anyone else gets a 404.
 */
export default async function HostPage({ params }: { params: Promise<{ gameSessionId: string }> }) {
  const { gameSessionId } = await params;
  const host = await requireHost(`/host/${encodeURIComponent(gameSessionId)}`);
  const game = await host.data.gameSessions.get(gameSessionId);
  if (!game) notFound();
  return (
    <HostScreen
      gameSessionId={game.id}
      gameName={gameDisplayName(game.gameType)}
      hasRoom={game.roomId !== null}
    />
  );
}
