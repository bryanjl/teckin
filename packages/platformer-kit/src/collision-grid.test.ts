import { describe, expect, it } from 'vitest';
import { CollisionGrid } from './collision-grid';
import { gridFromAscii } from './testing/ascii-grid';

const box = { width: 20, height: 30 };

describe('CollisionGrid', () => {
  it('treats the sides as walls and the top and bottom as open', () => {
    const grid = new CollisionGrid(4, 4, 32);
    expect(grid.at(-1, 0)).toBe('solid');
    expect(grid.at(4, 0)).toBe('solid');
    expect(grid.at(0, -1)).toBe('empty');
    expect(grid.at(0, 4)).toBe('empty');
  });

  it('lands a falling box on top of a solid tile', () => {
    const grid = gridFromAscii(['....', '....', '####']);
    const result = grid.move({ x: 10, y: 20, ...box }, 0, 40);
    expect(result.landed).toBe(true);
    expect(result.y + box.height).toBe(64);
  });

  it('does not tunnel through a tile on a long step', () => {
    const grid = gridFromAscii(['....', '....', '....', '####', '....', '....']);
    const result = grid.move({ x: 10, y: 0, ...box }, 0, 150);
    expect(result.landed).toBe(true);
    expect(result.y + box.height).toBe(96);
  });

  it('lets a box rise through a one-way ledge and land on it from above', () => {
    const grid = gridFromAscii(['....', '....', '====', '....', '....']);
    const rising = grid.move({ x: 10, y: 100, ...box }, 0, -60);
    expect(rising.hitCeiling).toBe(false);
    expect(rising.y).toBe(40);
    // Falling again from just above the ledge lands on it.
    const falling = grid.move({ x: 10, y: 30, ...box }, 0, 20);
    expect(falling.landed).toBe(true);
    expect(falling.y + box.height).toBe(64);
  });

  it('does not catch a box that is already inside a one-way ledge', () => {
    const grid = gridFromAscii(['....', '....', '====', '....', '....']);
    // Feet 10 px into the ledge row: still passing up through it, so keep falling.
    const result = grid.move({ x: 10, y: 44, ...box }, 0, 5);
    expect(result.landed).toBe(false);
  });

  it('bumps a rising box on a solid ceiling', () => {
    const grid = gridFromAscii(['####', '....', '....', '....']);
    const result = grid.move({ x: 10, y: 60, ...box }, 0, -50);
    expect(result.hitCeiling).toBe(true);
    expect(result.y).toBe(32);
  });

  it('stops at walls but walks through one-way tiles sideways', () => {
    const grid = gridFromAscii(['..#.', '..=.', '....']);
    expect(grid.move({ x: 10, y: 0, width: 20, height: 30 }, 50, 0)).toMatchObject({
      x: 44,
      hitRight: true,
    });
    expect(grid.move({ x: 10, y: 34, width: 20, height: 28 }, 50, 0)).toMatchObject({
      x: 60,
      hitRight: false,
    });
  });

  it('does not treat the floor under a standing box as a wall', () => {
    const grid = gridFromAscii(['....', '####']);
    const result = grid.move({ x: 10, y: 2, ...box }, 40, 0);
    expect(result.hitRight).toBe(false);
    expect(result.x).toBe(50);
  });

  it('knows when a box stands on a tile', () => {
    const grid = gridFromAscii(['....', '=...']);
    expect(grid.isStandingOn({ x: 0, y: 2, ...box })).toBe(true);
    expect(grid.isStandingOn({ x: 40, y: 2, ...box })).toBe(false);
    expect(grid.isStandingOn({ x: 0, y: 1, ...box })).toBe(false);
  });
});
