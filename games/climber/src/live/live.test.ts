import { describe, expect, it } from 'vitest';
import { climberPlayerVariants } from '../theme';
import {
  climberStandings,
  climberVariantFor,
  formatRank,
  isClimberRoomState,
  rankClimberPlayers,
  summariseClimber,
  type ClimberProgressView,
  type ClimberRoomStateView,
} from './climber-state-view';
import { OtherClimbers } from './other-climbers';

interface FakeClimber extends Partial<ClimberProgressView> {
  id: string;
  nickname?: string;
  connected?: boolean;
  removed?: boolean;
}

function fakeState(climbers: FakeClimber[], extra: Partial<ClimberRoomStateView> = {}) {
  const players = new Map(
    climbers.map((climber) => [
      climber.id,
      {
        id: climber.id,
        nickname: climber.nickname ?? climber.id,
        connected: climber.connected ?? true,
        removed: climber.removed ?? false,
      },
    ]),
  );
  const progress = new Map(
    climbers
      .filter((climber) => !climber.removed)
      .map((climber) => [
        climber.id,
        {
          x: 0,
          y: 0,
          heightMetres: 0,
          bestHeightMetres: 0,
          summitsReached: 0,
          finished: false,
          rank: 0,
          answered: 0,
          correct: 0,
          ...climber,
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
  } satisfies ClimberRoomStateView;
}

describe('climberStandings', () => {
  it('orders by the server rank, names from the roster and marks the winner', () => {
    const state = fakeState(
      [
        { id: 'a', nickname: 'Ada', rank: 2, heightMetres: 300, answered: 4, correct: 3 },
        { id: 'b', nickname: 'Bo', rank: 1, finished: true, heightMetres: 1000, summitsReached: 6 },
        { id: 'c', nickname: 'Cy', rank: 0 },
      ],
      { winnerId: 'b', phase: 'ended' },
    );
    const rows = climberStandings(state);
    expect(rows.map((row) => row.nickname)).toEqual(['Bo', 'Ada', 'Cy']);
    expect(rows[0]).toMatchObject({ scoreLabel: 'Top!', isWinner: true, summitsReached: 6 });
    expect(rows[1]).toMatchObject({ scoreLabel: '300 m', accuracy: 0.75, isWinner: false });
    expect(rows[1]!.detail).toContain('75%');
    expect(rankClimberPlayers(state)[0]).toEqual({ playerId: 'b', rank: 1, scoreLabel: 'Top!' });
    expect(summariseClimber(state, 'a')).toMatchObject({ rank: 2, accuracy: '75%' });
    expect(summariseClimber(state, 'nobody')).toEqual({});
  });

  it('recognises climber state', () => {
    expect(isClimberRoomState(fakeState([]))).toBe(true);
    expect(isClimberRoomState({ phase: 'lobby' })).toBe(false);
    expect(isClimberRoomState(undefined)).toBe(false);
  });
});

describe('formatRank and climberVariantFor', () => {
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(formatRank)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
    ]);
  });

  it('gives each player id a stable theme colour, spread across the variants', () => {
    expect(climberVariantFor('abc')).toBe(climberVariantFor('abc'));
    const used = new Set(Array.from({ length: 200 }, (_, index) => climberVariantFor(`p${index}`)));
    expect(used.size).toBe(climberPlayerVariants.length);
  });
});

describe('OtherClimbers', () => {
  it('interpolates between snapshots, drawn one delay behind, and holds the newest', () => {
    const others = new OtherClimbers('me', { interpolationDelayMs: 100 });
    others.ingest(fakeState([{ id: 'me' }, { id: 'a', x: 0, y: 500 }]), 1_000);
    others.ingest(fakeState([{ id: 'me' }, { id: 'a', x: 100, y: 400 }]), 1_100);
    const near = { x: 0, y: 0 };
    expect(others.poses(1_150, near)[0]).toMatchObject({ x: 50, y: 450, facing: 1 });
    expect(others.poses(1_300, near)[0]).toMatchObject({ x: 100, y: 400 });
    expect(others.poses(900, near)[0]).toMatchObject({ x: 0, y: 500 });
    others.ingest(fakeState([{ id: 'me' }, { id: 'a', x: 40, y: 400 }]), 1_200);
    expect(others.poses(1_400, near)[0]).toMatchObject({ x: 40, facing: -1 });
  });

  it('jump-cuts long moves such as a respawn instead of sliding across the course', () => {
    const others = new OtherClimbers('me', { interpolationDelayMs: 0, teleportDistance: 200 });
    others.ingest(fakeState([{ id: 'a', x: 0, y: 2_000 }]), 0);
    others.ingest(fakeState([{ id: 'a', x: 0, y: 200 }]), 100);
    expect(others.poses(50, { x: 0, y: 0 })[0]!.y).toBe(2_000);
    expect(others.poses(100, { x: 0, y: 0 })[0]!.y).toBe(200);
  });

  it('draws only the nearest 15, never itself, and forgets players who leave or drop', () => {
    const climbers: FakeClimber[] = [{ id: 'me', x: 0, y: 0 }];
    for (let index = 0; index < 40; index += 1) {
      climbers.push({ id: `p${index}`, x: 0, y: index * 10 });
    }
    climbers.push({ id: 'gone', connected: false, x: 0, y: 1 });
    const others = new OtherClimbers('me');
    others.ingest(fakeState(climbers), 0);
    const poses = others.poses(1_000, { x: 0, y: 0 });
    expect(poses).toHaveLength(15);
    expect(poses.map((pose) => pose.playerId)).toEqual(
      Array.from({ length: 15 }, (_, index) => `p${index}`),
    );
    others.ingest(fakeState(climbers.slice(0, 3)), 100);
    expect(others.trackedCount).toBe(2);
  });
});
