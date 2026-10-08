import type { PlayerStanding } from '@teckin/game-contracts';
import type { ComponentType } from 'react';
import { climberHostPanel } from './climber-host-panel';

/**
 * What a game adds to the platform's host screen: its live view (the Climber's tower), its
 * ranking for the shared leaderboard, and player colours. The platform draws everything
 * else (code, QR, lobby, timer, controls). Phase 4's game registry will carry these.
 */
export interface HostGamePanel {
  /** Name shown in the host screen's header. */
  title: string;
  /** The room's ranking, best first. */
  standings: (state: unknown) => PlayerStanding[];
  /** Player id of the winner once decided, else empty. */
  winnerId: (state: unknown) => string;
  /** The colour a player has in the game, for leaderboard markers. */
  markerColourOf?: (playerId: string) => string | undefined;
  /** Short notes about the game's settings, shown in the lobby ("Checkpoints on"). */
  settingsSummary: (state: unknown) => string[];
  /** The game's live view during play. */
  LiveView: ComponentType<{ state: unknown }>;
}

const panels: Readonly<Record<string, HostGamePanel>> = {
  climber: climberHostPanel,
};

/** The host panel for a game id, or `undefined` for a game this app does not know. */
export function hostPanelFor(gameId: string): HostGamePanel | undefined {
  return panels[gameId];
}
