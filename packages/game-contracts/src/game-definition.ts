import type { ZodType } from 'zod';
import type { ClientGameShell } from './shell';

/** One row of a game's final ranking, used by the shared leaderboard and reports. */
export interface PlayerRanking {
  playerId: string;
  rank: number;
  /** Game-specific value the rank was decided by, already formatted for display (for example "742 m"). */
  scoreLabel: string;
}

/**
 * The page element a client game mounts into. Typed structurally rather than as `HTMLElement`
 * so server code can import this package without DOM types; any DOM element satisfies it.
 */
export interface ClientGameMountTarget {
  readonly nodeType: number;
}

/** What a game's lazy-loaded client bundle exposes to the play page. */
export interface ClientGameModule {
  /** Starts the game inside `parent` and returns a function that tears it down. */
  mount: (parent: ClientGameMountTarget, options: ClientGameMountOptions) => Promise<() => void>;
}

/** Options the play page passes when mounting a client game. */
export interface ClientGameMountOptions {
  /** Query-string flags such as `debug` or `checkpoints`, already parsed. */
  flags: Readonly<Record<string, string>>;
  /**
   * URL of the folder where the app serves this game's built assets (theme atlases and
   * manifests), ending in `/`. The app decides where assets live; the game never assumes.
   */
  assetBaseUrl: string;
  /**
   * Theme pack chosen by the deployment (and later the host). Optional: the game falls back
   * to its own default, and a `theme` flag overrides it for previews.
   */
  themeId?: string;
  /** Session, question sheet, results screen and sound, supplied by the app. */
  shell: ClientGameShell;
}

/**
 * The contract every game plug-in implements. Adding a game means implementing this and
 * registering it in the web and realtime apps; nothing else in the platform changes.
 *
 * The definition holds what both apps need. Each app pairs it with its own half, so neither
 * app bundles the other's code: the realtime server with the game's room (`ServerGame` in
 * `@teckin/room-core`), the web app with the lazily loaded client (`ClientGame`). See
 * docs/DECISIONS.md.
 */
export interface GameDefinition<Settings, State> {
  id: string;
  displayName: string;
  /**
   * Drives the host's auto-generated settings form (see `settingsFormFields`) and validates
   * stored settings. A `z.object` whose every field has a default.
   */
  settingsSchema: ZodType<Settings>;
  defaultSettings: Settings;
  supportsAssignments: boolean;
  rankPlayers: (state: State) => PlayerRanking[];
  summarisePlayer: (state: State, playerId: string) => Record<string, number | string>;
  /**
   * The game's own figures a report shows beside each player's rank and accuracy, read from
   * the stats the game recorded with each result. In display order.
   */
  reportColumns: readonly ReportColumn[];
}

/** One game-specific column in a game report and its CSV export. */
export interface ReportColumn {
  /** Key in the result's recorded stats. */
  key: string;
  /** Column heading, e.g. "Best height". */
  label: string;
  /** Appended to numbers on screen (not in CSV), e.g. "m". */
  unit?: string;
}

/**
 * Identity helper that checks a game definition against the contract while keeping its
 * precise `Settings` and `State` types.
 */
export function defineGame<Settings, State>(
  definition: GameDefinition<Settings, State>,
): GameDefinition<Settings, State> {
  return definition;
}

/** A game as the web app registers it: the definition plus its lazily loaded client. */
export interface ClientGame<Settings = unknown, State = unknown> {
  definition: GameDefinition<Settings, State>;
  /** Loads the game's Phaser scenes; only the play pages call it. */
  loadClientGame: () => Promise<ClientGameModule>;
}
