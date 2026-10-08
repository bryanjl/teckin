// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CourseBot,
  CourseProgress,
  createPlatformerBody,
  footOf,
  stepPlatformer,
} from '@teckin/platformer-kit';
import { describe, expect, it } from 'vitest';
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

  it('has a start and summits 1 and 2 at a sixth and a third of the full height', () => {
    const course = createClimberCourse(bundledCourseMap, defaultClimberTunables);
    expect(course.summits.map((summit) => summit.number)).toEqual([1, 2]);
    expect(course.heightAt(course.spawn.y)).toBe(0);
    expect(course.heightAt(course.summits[0]!.respawnY)).toBeCloseTo(1000 / 6);
    expect(course.heightAt(course.summits[1]!.respawnY)).toBeCloseTo(1000 / 3);
    expect(course.map.grid.at(0, course.map.rows - 1)).toBe('solid');
  });

  it('can be climbed to the top of summit 2 by the bot with the real tuning', () => {
    const { physics } = defaultClimberTunables;
    const course = createClimberCourse(bundledCourseMap, defaultClimberTunables);
    const progress = new CourseProgress(course.summits, false);
    const bot = new CourseBot(course.map.grid, physics);
    let body = createPlatformerBody(course.spawn.x, course.spawn.y, physics);
    let jumpWasDown = false;
    let seconds = 0;
    while (!progress.finished && seconds < 180) {
      const buttons = bot.decide(body);
      body = stepPlatformer(
        body,
        {
          left: buttons.left,
          right: buttons.right,
          jumpHeld: buttons.jump,
          jumpPressed: buttons.jump && !jumpWasDown,
        },
        course.map.grid,
        physics,
        physics.fixedStep,
      ).body;
      jumpWasDown = buttons.jump;
      progress.update(
        { x: body.x, y: body.y, width: physics.bodyWidth, height: physics.bodyHeight },
        body.onGround,
      );
      seconds += physics.fixedStep;
    }
    expect(progress.finished).toBe(true);
    expect(footOf(body, physics).y).toBeLessThanOrEqual(course.summits[1]!.respawnY);
    // A bot with perfect timing should finish well inside a minute and a half.
    expect(seconds).toBeLessThan(90);
  });

  it('rejects a map of the wrong width', () => {
    const narrow = {
      ...defaultClimberTunables,
      physics: { ...defaultClimberTunables.physics, worldWidthTiles: 10 },
    };
    expect(() => createClimberCourse(bundledCourseMap, narrow)).toThrow(/12 tiles wide/);
  });
});
