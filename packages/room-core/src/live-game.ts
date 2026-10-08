import type { GamePhaseName } from '@teckin/game-contracts';
import { checkNickname } from '@teckin/nicknames';

/** Where a game is in its life. Every game shares these phases. */
export type GamePhase = GamePhaseName;

/** Why a game ended. */
export type GameEndReason = 'hostEnded' | 'timeUp' | 'goalReached' | 'abandoned';

/** Host-controlled room settings that every game shares. */
export interface LiveGameOptions {
  /** Most players the room admits. */
  maxPlayers: number;
  /** Whether players may join after the countdown has started. */
  allowLateJoin: boolean;
  /** Length of the playing phase, in milliseconds. */
  durationMs: number;
  /** Length of the 3-2-1 countdown, in milliseconds. */
  countdownMs: number;
  /** Longest a game may be extended to in total, in milliseconds. */
  maxDurationMs: number;
}

/** Defaults for {@link LiveGameOptions}: 60 players, late join on, 15 minutes, 3 s countdown. */
export const defaultLiveGameOptions: LiveGameOptions = {
  maxPlayers: 60,
  allowLateJoin: true,
  durationMs: 15 * 60_000,
  countdownMs: 3_000,
  maxDurationMs: 60 * 60_000,
};

/** One player as the platform sees them. No personal data: a nickname and a hashed device key. */
export interface LivePlayer {
  readonly id: string;
  nickname: string;
  /** Hash of the random key the player's browser keeps; used only to enforce kicks. */
  readonly deviceKeyHash: string;
  connected: boolean;
  readonly joinedAtMs: number;
  /** Set when the host removed the player. Removed players stay listed for the record but leave rankings. */
  removedAtMs?: number;
}

/** Why a join was refused. Clients show a message for each. */
export type JoinRejection =
  | 'gameEnded'
  | 'lateJoinClosed'
  | 'locked'
  | 'roomFull'
  | 'kicked'
  | 'nicknameTaken'
  | 'nicknameInvalid';

/** Result of {@link LiveGame.admitPlayer}. */
export type AdmitResult = { ok: true; player: LivePlayer } | { ok: false; reason: JoinRejection };

/** Something that changed, for the room to forward to games, recorders and logs. */
export type LiveGameEvent =
  | { type: 'countdownStarted'; endsAtMs: number }
  | { type: 'started'; startedAtMs: number; endsAtMs: number }
  | { type: 'ended'; reason: GameEndReason; endedAtMs: number };

/** Checks a nickname. Returns the cleaned nickname, or `null` when it may not be used. */
export type NicknameCheck = (nickname: string) => string | null;

/**
 * The default nickname check: the platform's shared rules (length, characters, digits and
 * the profanity filter) from `@teckin/nicknames`, the same check the join form runs.
 */
export const platformNicknameCheck: NicknameCheck = checkNickname;

/**
 * The shared game lifecycle and roster, free of any network framework so it can be unit
 * tested and reused by every game's room: lobby, countdown, playing and ended; joining with
 * caps, locks, late join and kicks; renaming; the server-side timer.
 *
 * Time is always passed in, so the model never reads a clock itself.
 */
export class LiveGame {
  readonly options: LiveGameOptions;
  private currentPhase: GamePhase = 'lobby';
  private readonly playersById = new Map<string, LivePlayer>();
  private readonly kickedDeviceKeyHashes = new Set<string>();
  private isLocked = false;
  private countdownEndsAtMs: number | null = null;
  private playStartedAtMs: number | null = null;
  private playEndsAtMs: number | null = null;
  private gameEndedAtMs: number | null = null;
  private gameEndReason: GameEndReason | null = null;
  private readonly checkNickname: NicknameCheck;

  constructor(
    options: Partial<LiveGameOptions> = {},
    checkNickname: NicknameCheck = platformNicknameCheck,
  ) {
    this.options = { ...defaultLiveGameOptions, ...options };
    this.checkNickname = checkNickname;
  }

  get phase(): GamePhase {
    return this.currentPhase;
  }

  get locked(): boolean {
    return this.isLocked;
  }

  /** When the countdown ends, while counting down. */
  get countdownEndsAt(): number | null {
    return this.countdownEndsAtMs;
  }

  get startedAt(): number | null {
    return this.playStartedAtMs;
  }

  /** When the timer runs out, once playing. */
  get endsAt(): number | null {
    return this.playEndsAtMs;
  }

  get endedAt(): number | null {
    return this.gameEndedAtMs;
  }

  get endReason(): GameEndReason | null {
    return this.gameEndReason;
  }

  /** Every player ever admitted, including removed ones, in join order. */
  get allPlayers(): readonly LivePlayer[] {
    return [...this.playersById.values()];
  }

  /** Players still in the game (not removed by the host). */
  get activePlayers(): LivePlayer[] {
    return this.allPlayers.filter((player) => player.removedAtMs === undefined);
  }

  player(playerId: string): LivePlayer | undefined {
    return this.playersById.get(playerId);
  }

  /** Whether a device was kicked and the host has not allowed it back. */
  isDeviceKicked(deviceKeyHash: string): boolean {
    return this.kickedDeviceKeyHashes.has(deviceKeyHash);
  }

  /**
   * Admits a new player if the game, lock, cap, kick list and nickname all allow it.
   * Reconnecting players never come through here; they keep their existing entry.
   */
  admitPlayer(request: {
    playerId: string;
    nickname: string;
    deviceKeyHash: string;
    nowMs: number;
  }): AdmitResult {
    if (this.currentPhase === 'ended') {
      return { ok: false, reason: 'gameEnded' };
    }
    if (this.currentPhase !== 'lobby' && !this.options.allowLateJoin) {
      return { ok: false, reason: 'lateJoinClosed' };
    }
    if (this.kickedDeviceKeyHashes.has(request.deviceKeyHash)) {
      return { ok: false, reason: 'kicked' };
    }
    if (this.isLocked) {
      return { ok: false, reason: 'locked' };
    }
    if (this.activePlayers.length >= this.options.maxPlayers) {
      return { ok: false, reason: 'roomFull' };
    }
    const nickname = this.checkNickname(request.nickname);
    if (nickname === null) {
      return { ok: false, reason: 'nicknameInvalid' };
    }
    if (this.isNicknameTaken(nickname)) {
      return { ok: false, reason: 'nicknameTaken' };
    }
    const player: LivePlayer = {
      id: request.playerId,
      nickname,
      deviceKeyHash: request.deviceKeyHash,
      connected: true,
      joinedAtMs: request.nowMs,
    };
    this.playersById.set(player.id, player);
    return { ok: true, player };
  }

  /** Marks a player as connected or not (phone locked, signal lost, back again). */
  setConnected(playerId: string, connected: boolean): void {
    const player = this.playersById.get(playerId);
    if (player) {
      player.connected = connected;
    }
  }

  /** Renames a player (host action). Returns the rejection reason when the name cannot be used. */
  renamePlayer(
    playerId: string,
    nickname: string,
  ): 'nicknameInvalid' | 'nicknameTaken' | 'unknownPlayer' | null {
    const player = this.playersById.get(playerId);
    if (!player || player.removedAtMs !== undefined) {
      return 'unknownPlayer';
    }
    const cleaned = this.checkNickname(nickname);
    if (cleaned === null) {
      return 'nicknameInvalid';
    }
    if (this.isNicknameTaken(cleaned, playerId)) {
      return 'nicknameTaken';
    }
    player.nickname = cleaned;
    return null;
  }

  /** Removes a player and blocks their device from rejoining (host action). */
  kickPlayer(playerId: string, nowMs: number): LivePlayer | undefined {
    const player = this.playersById.get(playerId);
    if (!player || player.removedAtMs !== undefined) {
      return undefined;
    }
    player.removedAtMs = nowMs;
    player.connected = false;
    this.kickedDeviceKeyHashes.add(player.deviceKeyHash);
    return player;
  }

  /** Lets every kicked device join again (host action). */
  allowKickedDevices(): void {
    this.kickedDeviceKeyHashes.clear();
  }

  /** Stops (or allows) new players joining (host action). */
  setLocked(locked: boolean): void {
    this.isLocked = locked;
  }

  /** Starts the 3-2-1 countdown from the lobby (host action). */
  startCountdown(nowMs: number): LiveGameEvent | null {
    if (this.currentPhase !== 'lobby') {
      return null;
    }
    this.currentPhase = 'countdown';
    this.countdownEndsAtMs = nowMs + this.options.countdownMs;
    return { type: 'countdownStarted', endsAtMs: this.countdownEndsAtMs };
  }

  /** Adds playing time, up to the longest game allowed (host action). Returns the new end time. */
  addTime(extraMs: number): number | null {
    if (
      this.currentPhase !== 'playing' ||
      this.playStartedAtMs === null ||
      this.playEndsAtMs === null
    ) {
      return null;
    }
    const latestEnd = this.playStartedAtMs + this.options.maxDurationMs;
    this.playEndsAtMs = Math.min(latestEnd, this.playEndsAtMs + Math.max(0, extraMs));
    return this.playEndsAtMs;
  }

  /** Ends the game at once. Does nothing if it has already ended. */
  end(reason: GameEndReason, nowMs: number): LiveGameEvent | null {
    if (this.currentPhase === 'ended') {
      return null;
    }
    this.currentPhase = 'ended';
    this.gameEndedAtMs = nowMs;
    this.gameEndReason = reason;
    this.countdownEndsAtMs = null;
    return { type: 'ended', reason, endedAtMs: nowMs };
  }

  /** Advances the timers. Call it regularly; it returns what changed, in order. */
  tick(nowMs: number): LiveGameEvent[] {
    const events: LiveGameEvent[] = [];
    if (
      this.currentPhase === 'countdown' &&
      this.countdownEndsAtMs !== null &&
      nowMs >= this.countdownEndsAtMs
    ) {
      this.currentPhase = 'playing';
      this.playStartedAtMs = this.countdownEndsAtMs;
      this.playEndsAtMs = this.playStartedAtMs + this.options.durationMs;
      this.countdownEndsAtMs = null;
      events.push({
        type: 'started',
        startedAtMs: this.playStartedAtMs,
        endsAtMs: this.playEndsAtMs,
      });
    }
    if (
      this.currentPhase === 'playing' &&
      this.playEndsAtMs !== null &&
      nowMs >= this.playEndsAtMs
    ) {
      const ended = this.end('timeUp', this.playEndsAtMs);
      if (ended) {
        events.push(ended);
      }
    }
    return events;
  }

  /** Milliseconds of play left, or `null` before play starts. */
  remainingMs(nowMs: number): number | null {
    if (this.playEndsAtMs === null) {
      return null;
    }
    const until = this.currentPhase === 'ended' ? (this.gameEndedAtMs ?? nowMs) : nowMs;
    return Math.max(0, this.playEndsAtMs - until);
  }

  private isNicknameTaken(nickname: string, exceptPlayerId?: string): boolean {
    const wanted = nickname.toLocaleLowerCase();
    return this.activePlayers.some(
      (player) => player.id !== exceptPlayerId && player.nickname.toLocaleLowerCase() === wanted,
    );
  }
}
