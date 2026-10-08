// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClimberBot } from '../run/climber-bot';
import { ClimberRun } from '../run/climber-run';
import { defaultClimberTunables } from '../tunables';
import { bundledCourseMap, createClimberCourse } from './course';
import { buildCourseTiledMap } from './course-layout';

const mapPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../maps/course.json',
);

describe('the bundled course', () => {
  it('matches its layout (run `pnpm generate:course` after changing the layout)', async () => {
    const onDisk: unknown = JSON.parse(await readFile(mapPath, 'utf8'));
    expect(onDisk).toEqual(buildCourseTiledMap());
  });

  it('has a start and six summits at equal steps of the 1,000 m height', () => {
    const course = createClimberCourse(bundledCourseMap, defaultClimberTunables);
    expect(course.summits.map((summit) => summit.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(course.heightAt(course.spawn.y)).toBe(0);
    course.summits.forEach((summit, index) => {
      expect(course.heightAt(summit.respawnY)).toBeCloseTo(((index + 1) * 1000) / 6);
    });
    expect(course.map.grid.at(0, course.map.rows - 1)).toBe('solid');
  });

  it('has every kind of hazard from summit 3 up, and none on summits 1 and 2', () => {
    const course = createClimberCourse(bundledCourseMap, defaultClimberTunables);
    const { hazards } = course;
    expect(hazards.movingPlatforms.length).toBeGreaterThan(0);
    expect(hazards.crumblingLedges.length).toBeGreaterThan(0);
    expect(hazards.vents.length).toBeGreaterThan(0);
    expect(hazards.barriers.length).toBeGreaterThan(0);
    const summit2Y = course.summits[1]!.respawnY;
    const ys = [
      ...hazards.movingPlatforms.map((platform) => platform.y),
      ...hazards.crumblingLedges.map((ledge) => ledge.row * course.map.tileSize),
      ...hazards.vents.map((vent) => vent.zone.y + vent.zone.height),
      ...hazards.barriers.map((barrier) => barrier.zone.y),
    ];
    for (const y of ys) expect(y).toBeLessThan(summit2Y);
  });

  it('can be climbed to the top of summit 6 by the bot with the real tuning and hazards', () => {
    const tunables = defaultClimberTunables;
    const course = createClimberCourse(bundledCourseMap, tunables);
    const run = new ClimberRun(course, tunables, { energy: 1e9, spendEnergy: () => true }, false);
    const bot = createClimberBot(run);
    let jumpWasDown = false;
    const summitTimes: number[] = [];
    while (!run.completed && run.elapsedSeconds < 400) {
      const buttons = bot.decide(run.body);
      const step = run.step({
        left: buttons.left,
        right: buttons.right,
        jumpHeld: buttons.jump,
        jumpPressed: buttons.jump && !jumpWasDown,
      });
      jumpWasDown = buttons.jump;
      if (step.reachedSummit !== undefined) summitTimes.push(run.elapsedSeconds);
    }
    expect(run.completed).toBe(true);
    expect(summitTimes).toHaveLength(6);
    // Perfect timing should take well under four minutes of climbing.
    expect(run.elapsedSeconds).toBeLessThan(240);
  });

  it('rejects a map of the wrong width', () => {
    const narrow = {
      ...defaultClimberTunables,
      physics: { ...defaultClimberTunables.physics, worldWidthTiles: 10 },
    };
    expect(() => createClimberCourse(bundledCourseMap, narrow)).toThrow(/12 tiles wide/);
  });
});
