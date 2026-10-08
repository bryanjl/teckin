import { climberVariantFor, type ClimberRoomStateView } from './climber-state-view';

/** Where to draw one other climber this frame. */
export interface OtherClimberPose {
  playerId: string;
  nickname: string;
  /** Feet, world pixels, interpolated. */
  x: number;
  y: number;
  /** 1 facing right, -1 facing left (from the last sideways movement). */
  facing: 1 | -1;
  /** Theme colour variant, e.g. `blue`. */
  variant: string;
}

/** Options for {@link OtherClimbers}. */
export interface OtherClimbersOptions {
  /** Most climbers drawn at once (the nearest ones). The spec caps this at 15. */
  maxShown?: number;
  /**
   * How far behind the newest snapshot others are drawn, in ms. Reports arrive about every
   * 100 ms, so drawing a little over one report behind always has two snapshots to blend.
   */
  interpolationDelayMs?: number;
  /** A jump between snapshots longer than this (world px) is drawn as a jump cut, not a slide. */
  teleportDistance?: number;
}

interface Snapshot {
  atMs: number;
  x: number;
  y: number;
}

interface Track {
  nickname: string;
  variant: string;
  facing: 1 | -1;
  snapshots: Snapshot[];
  seenInUpdate: number;
}

const maxSnapshots = 8;

/**
 * Other players as this device draws them. Every state update from the room is fed in with
 * its arrival time; each frame, {@link OtherClimbers.poses} blends between the two snapshots
 * around "now minus the interpolation delay", so climbers glide smoothly between 10 Hz
 * reports, and returns only the nearest few to keep low-end phones fast. Phaser-free.
 */
export class OtherClimbers {
  private readonly tracks = new Map<string, Track>();
  private updateNumber = 0;
  private readonly maxShown: number;
  private readonly delayMs: number;
  private readonly teleportDistance: number;

  constructor(
    private readonly ownPlayerId: string,
    options: OtherClimbersOptions = {},
  ) {
    this.maxShown = options.maxShown ?? 15;
    this.delayMs = options.interpolationDelayMs ?? 150;
    this.teleportDistance = options.teleportDistance ?? 320;
  }

  /** Climbers being tracked (connected, not removed, not this player). */
  get trackedCount(): number {
    return this.tracks.size;
  }

  /** Records the positions in a state update that arrived at `nowMs`. */
  ingest(state: ClimberRoomStateView, nowMs: number): void {
    this.updateNumber += 1;
    state.climbers.forEach((climber, playerId) => {
      if (playerId === this.ownPlayerId) return;
      const player = state.players.get(playerId);
      if (!player || player.removed || !player.connected) return;
      let track = this.tracks.get(playerId);
      if (!track) {
        track = {
          nickname: player.nickname,
          variant: climberVariantFor(playerId),
          facing: 1,
          snapshots: [],
          seenInUpdate: this.updateNumber,
        };
        this.tracks.set(playerId, track);
      }
      track.nickname = player.nickname;
      track.seenInUpdate = this.updateNumber;
      const last = track.snapshots.at(-1);
      if (last && last.x === climber.x && last.y === climber.y) return;
      if (last && climber.x !== last.x) track.facing = climber.x > last.x ? 1 : -1;
      track.snapshots.push({ atMs: nowMs, x: climber.x, y: climber.y });
      if (track.snapshots.length > maxSnapshots) track.snapshots.shift();
    });
    // Anyone missing from this update left, dropped or was removed.
    for (const [playerId, track] of this.tracks) {
      if (track.seenInUpdate !== this.updateNumber) this.tracks.delete(playerId);
    }
  }

  /**
   * Interpolated poses at `nowMs` for the climbers nearest to `near` (this player's feet),
   * nearest first, at most `maxShown` of them.
   */
  poses(nowMs: number, near: { x: number; y: number }): OtherClimberPose[] {
    const renderAtMs = nowMs - this.delayMs;
    const poses: (OtherClimberPose & { distance: number })[] = [];
    for (const [playerId, track] of this.tracks) {
      const position = this.positionAt(track.snapshots, renderAtMs);
      if (!position) continue;
      poses.push({
        playerId,
        nickname: track.nickname,
        x: position.x,
        y: position.y,
        facing: track.facing,
        variant: track.variant,
        distance: Math.hypot(position.x - near.x, position.y - near.y),
      });
    }
    poses.sort((a, b) => a.distance - b.distance || a.playerId.localeCompare(b.playerId));
    return poses.slice(0, this.maxShown).map(({ distance: _distance, ...pose }) => pose);
  }

  private positionAt(
    snapshots: readonly Snapshot[],
    atMs: number,
  ): { x: number; y: number } | undefined {
    const first = snapshots[0];
    if (!first) return undefined;
    if (atMs <= first.atMs) return { x: first.x, y: first.y };
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      const from = snapshots[index]!;
      if (from.atMs > atMs) continue;
      const to = snapshots[index + 1];
      // Past the newest snapshot: hold it rather than guess where the climber went.
      if (!to) return { x: from.x, y: from.y };
      if (Math.hypot(to.x - from.x, to.y - from.y) > this.teleportDistance) {
        return { x: from.x, y: from.y };
      }
      const progress = (atMs - from.atMs) / (to.atMs - from.atMs);
      return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    }
    return { x: first.x, y: first.y };
  }
}
