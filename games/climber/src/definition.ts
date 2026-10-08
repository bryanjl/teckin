import { defineGame } from '@teckin/game-contracts';
import {
  rankClimberPlayers,
  summariseClimber,
  type ClimberRoomStateView,
} from './live/climber-state-view';
import { climberSettingsSchema, defaultClimberSettings, type ClimberSettings } from './settings';

/** Stable id of the Climber game in the game registry. */
export const climberGameId = 'climber';

/** Working name of the Climber game (see docs/DECISIONS.md). */
export const climberDisplayName = 'Cogspire';

/**
 * The Climber as the platform sees it: its settings and its ranking. The realtime server pairs
 * it with `ClimberRoom` (`climberServerGame` in `@teckin/climber/server`) and the web app with
 * its client (`climberClientGame` in `@teckin/climber/client-game`).
 */
export const climberGame = defineGame<ClimberSettings, ClimberRoomStateView>({
  id: climberGameId,
  displayName: climberDisplayName,
  settingsSchema: climberSettingsSchema,
  defaultSettings: defaultClimberSettings,
  supportsAssignments: false,
  rankPlayers: rankClimberPlayers,
  summarisePlayer: summariseClimber,
  // Keys of the stats ClimberRoom records with each result.
  reportColumns: [
    { key: 'bestHeightMetres', label: 'Best height', unit: 'm' },
    { key: 'summitsReached', label: 'Summits' },
  ],
});
