import { describe, expect, it } from 'vitest';
import { rankClimbers, type ClimberStanding } from './ranking';

const standing = (playerId: string, fields: Partial<ClimberStanding>): ClimberStanding => ({
  playerId,
  heightMetres: 0,
  bestHeightMetres: 0,
  bestHeightAtMs: 0,
  finishedAtMs: null,
  joinedAtMs: 0,
  ...fields,
});

describe('rankClimbers', () => {
  it('puts finishers first by finish time, then the rest by current height', () => {
    const ranking = rankClimbers([
      standing('high', { heightMetres: 900, bestHeightMetres: 900 }),
      standing('late-finisher', { heightMetres: 1000, finishedAtMs: 9000 }),
      standing('low', { heightMetres: 100, bestHeightMetres: 600 }),
      standing('first-finisher', { heightMetres: 1000, finishedAtMs: 5000 }),
    ]);
    expect(ranking).toEqual([
      { playerId: 'first-finisher', rank: 1 },
      { playerId: 'late-finisher', rank: 2 },
      { playerId: 'high', rank: 3 },
      { playerId: 'low', rank: 4 },
    ]);
  });

  it('breaks height ties by best height, then by who reached it first, then join order', () => {
    const ranking = rankClimbers([
      standing('a', {
        heightMetres: 300,
        bestHeightMetres: 400,
        bestHeightAtMs: 50,
        joinedAtMs: 1,
      }),
      standing('b', {
        heightMetres: 300,
        bestHeightMetres: 500,
        bestHeightAtMs: 90,
        joinedAtMs: 2,
      }),
      standing('c', {
        heightMetres: 300,
        bestHeightMetres: 400,
        bestHeightAtMs: 20,
        joinedAtMs: 3,
      }),
      standing('d', {
        heightMetres: 300,
        bestHeightMetres: 400,
        bestHeightAtMs: 20,
        joinedAtMs: 0,
      }),
    ]);
    expect(ranking.map((row) => row.playerId)).toEqual(['b', 'd', 'c', 'a']);
  });
});
