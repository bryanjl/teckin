import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { climberPlayerVariants, climberVariantSwatches } from '../theme';
import { defaultClimberTunables } from '../tunables';
import {
  checkpointsSettingOf,
  climberVariantFor,
  type ClimberRoomStateView,
} from './climber-state-view';
import { climberTowerModel } from './tower-view';

function roomState(
  climbers: {
    id: string;
    x?: number;
    heightMetres?: number;
    rank?: number;
    finished?: boolean;
    connected?: boolean;
    removed?: boolean;
  }[],
  extra: Partial<ClimberRoomStateView> = {},
): ClimberRoomStateView {
  const players = new Map(
    climbers.map((climber) => [
      climber.id,
      {
        id: climber.id,
        nickname: `Name ${climber.id}`,
        connected: climber.connected ?? true,
        removed: climber.removed ?? false,
      },
    ]),
  );
  const progress = new Map(
    climbers.map((climber) => [
      climber.id,
      {
        x: climber.x ?? 0,
        y: 0,
        heightMetres: climber.heightMetres ?? 0,
        bestHeightMetres: climber.heightMetres ?? 0,
        summitsReached: 0,
        finished: climber.finished ?? false,
        rank: climber.rank ?? 0,
        answered: 0,
        correct: 0,
      },
    ]),
  );
  return {
    gameId: 'climber',
    joinCode: '123456',
    phase: 'playing',
    locked: false,
    allowLateJoin: true,
    maxPlayers: 60,
    countdownRemainingMs: 0,
    remainingMs: 60_000,
    endReason: '',
    players,
    climbers: progress,
    summitCount: 6,
    winnerId: '',
    checkpointsEnabled: false,
    ...extra,
  };
}

describe('climberTowerModel', () => {
  const worldWidth =
    defaultClimberTunables.physics.worldWidthTiles * defaultClimberTunables.physics.tileSize;

  it('puts every player at their height, with summit lines evenly up the course', () => {
    const model = climberTowerModel(
      roomState([
        { id: 'a', heightMetres: 500, rank: 2, x: worldWidth / 2 },
        { id: 'b', heightMetres: 1000, finished: true, rank: 1, x: worldWidth },
        { id: 'c', heightMetres: -12, rank: 3, x: -40, connected: false },
        { id: 'gone', heightMetres: 400, removed: true },
      ]),
    );
    expect(model.summits.map((summit) => summit.heightMetres)).toEqual([
      167, 333, 500, 667, 833, 1000,
    ]);
    expect(model.summits[5]!.heightFraction).toBe(1);
    expect(model.dots.map((dot) => dot.playerId)).toEqual(['c', 'a', 'b']);
    const byId = Object.fromEntries(model.dots.map((dot) => [dot.playerId, dot]));
    expect(byId.a!.heightFraction).toBe(0.5);
    expect(byId.a!.sideFraction).toBeGreaterThan(0.46);
    expect(byId.a!.sideFraction).toBeLessThan(0.54);
    expect(byId.b!.heightFraction).toBe(1);
    expect(byId.b!.sideFraction).toBe(1);
    expect(byId.c).toMatchObject({ heightFraction: 0, sideFraction: 0, connected: false });
    expect(byId.a!.colour).toBe(climberVariantSwatches[climberVariantFor('a')]);
    expect(byId.a!.nickname).toBe('Name a');
  });

  it('spreads players standing on the same spot and draws the unranked first', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `player-${index}`);
    const model = climberTowerModel(
      roomState(
        ids.map((id, index) => ({ id, x: worldWidth / 4, rank: index < 6 ? index + 1 : 0 })),
      ),
    );
    expect(new Set(model.dots.map((dot) => dot.sideFraction)).size).toBeGreaterThan(6);
    expect(model.dots.slice(-6).map((dot) => dot.rank)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(model.dots.slice(0, 6).every((dot) => dot.rank === 0)).toBe(true);
  });
});

describe('climberVariantSwatches', () => {
  it('matches the body colour of each player variant in the default theme', () => {
    const theme = JSON.parse(
      readFileSync(new URL('../../themes/cogspire/theme.json', import.meta.url), 'utf8'),
    ) as { spriteVariants: { player: { id: string; replace: Record<string, string> }[] } };
    const baseBody = '#d4a24c';
    for (const variant of climberPlayerVariants) {
      const entry = theme.spriteVariants.player.find((item) => item.id === variant)!;
      expect(climberVariantSwatches[variant]).toBe(entry.replace[baseBody] ?? baseBody);
    }
  });
});

describe('checkpointsSettingOf', () => {
  it('reads the host setting from the room state and is off otherwise', () => {
    expect(checkpointsSettingOf(roomState([], { checkpointsEnabled: true }))).toBe(true);
    expect(checkpointsSettingOf(roomState([]))).toBe(false);
    expect(checkpointsSettingOf(undefined)).toBe(false);
    expect(checkpointsSettingOf({ phase: 'playing', checkpointsEnabled: true })).toBe(false);
  });
});
