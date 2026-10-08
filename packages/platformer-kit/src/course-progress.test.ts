import { describe, expect, it } from 'vitest';
import { CourseProgress, createHeightScale, type CourseGoal } from './course-progress';

describe('createHeightScale', () => {
  const scale = createHeightScale([
    { y: 1000, height: 0 },
    { y: 600, height: 100 },
    { y: 400, height: 200 },
  ]);

  it('maps linearly inside each segment', () => {
    expect(scale(1000)).toBe(0);
    expect(scale(800)).toBe(50);
    expect(scale(600)).toBe(100);
    expect(scale(500)).toBe(150);
  });

  it('extends past the top and clamps below the start', () => {
    expect(scale(300)).toBe(250);
    expect(scale(1200)).toBe(0);
  });

  it('rejects stops that do not rise', () => {
    expect(() => createHeightScale([{ y: 10, height: 0 }])).toThrow();
    expect(() =>
      createHeightScale([
        { y: 10, height: 5 },
        { y: 5, height: 5 },
      ]),
    ).toThrow();
  });
});

describe('CourseProgress', () => {
  const goal = (y: number): CourseGoal => ({
    x: 0,
    y,
    width: 100,
    height: 32,
    respawnX: 50,
    respawnY: y + 32,
  });
  const at = (y: number) => ({ x: 40, y, width: 20, height: 28 });

  it('counts goals only in order and finishes on the last one', () => {
    const progress = new CourseProgress([goal(500), goal(200)], false);
    expect(progress.update(at(190), true)).toEqual({ finished: false });
    expect(progress.goalsReached).toBe(0);
    expect(progress.update(at(500), false)).toEqual({ finished: false });
    expect(progress.update(at(500), true)).toEqual({ reachedGoal: 0, finished: false });
    expect(progress.update(at(500), true)).toEqual({ finished: false });
    expect(progress.update(at(200), true)).toEqual({ reachedGoal: 1, finished: true });
    expect(progress.finished).toBe(true);
  });

  it('tracks the best height reached', () => {
    const progress = new CourseProgress([goal(0)], false);
    progress.update(at(400), false);
    progress.update(at(300), false);
    progress.update(at(450), false);
    expect(progress.bestFootY).toBe(328);
  });

  it('offers a checkpoint only when enabled and the player has fallen below it', () => {
    const off = new CourseProgress([goal(500), goal(200)], false);
    off.update(at(500), true);
    expect(off.checkpoint).toBeUndefined();
    expect(off.isBelowCheckpoint(900, 64)).toBe(false);

    const on = new CourseProgress([goal(500), goal(200)], true);
    expect(on.checkpoint).toBeUndefined();
    on.update(at(500), true);
    expect(on.checkpoint?.respawnY).toBe(532);
    expect(on.isBelowCheckpoint(560, 64)).toBe(false);
    expect(on.isBelowCheckpoint(700, 64)).toBe(true);
    on.reset();
    expect(on.goalsReached).toBe(0);
    expect(on.checkpoint).toBeUndefined();
  });
});
