import type { ZodType } from 'zod';

/** One row of a game's final ranking, used by the shared leaderboard and reports. */
export interface PlayerRanking {
  playerId: string;
  rank: number;
  /** Game-specific value the rank was decided by, already formatted for display (for example "742 m"). */
  scoreLabel: string;
}

/**
 * Creates the server-side room for a game. The concrete room type comes from `room-core`
 * once the realtime server exists; until then the factory is typed loosely on purpose so
 * this package stays free of server dependencies.
 */
export type RoomFactory<Settings, State> = (options: {
  settings: Settings;
  initialState: () => State;
}) => unknown;

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
}

/**
 * The contract every game plug-in implements. Adding a game means implementing this and
 * registering it in the web and realtime apps; nothing else in the platform changes.
 */
export interface GameDefinition<Settings, State> {
  id: string;
  displayName: string;
  /** Drives the host's auto-generated settings form and validates stored settings. */
  settingsSchema: ZodType<Settings>;
  defaultSettings: Settings;
  supportsAssignments: boolean;
  createServerRoom: RoomFactory<Settings, State>;
  loadClientGame: () => Promise<ClientGameModule>;
  rankPlayers: (state: State) => PlayerRanking[];
  summarisePlayer: (state: State, playerId: string) => Record<string, number | string>;
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
