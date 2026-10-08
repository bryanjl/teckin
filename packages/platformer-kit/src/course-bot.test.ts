import { describe, expect, it } from 'vitest';
import { CourseBot, findLedges } from './course-bot';
import { createPlatformerBody, footOf, stepPlatformer } from './controller';
import { gridFromAscii } from './testing/ascii-grid';
import { testTuning as tuning } from './testing/tuning';

// A small tower: one-way ledges 3 and 4 tiles apart, one off to the side needing a run.
const tower = gridFromAscii([
  '..........',
  '.====.....',
  '..........',
  '..........',
  '......####',
  '..........',
  '..........',
  '..........',
  '..====....',
  '..........',
  '..........',
  '.....===..',
  '..........',
  '..........',
  '##########',
]);

describe('findLedges', () => {
  it('finds standable runs and skips buried tiles', () => {
    const grid = gridFromAscii(['....', '.==#', '####', '####']);
    expect(findLedges(grid)).toEqual([
      { row: 1, fromColumn: 1, toColumn: 2, collision: 'oneWay' },
      { row: 1, fromColumn: 3, toColumn: 3, collision: 'solid' },
      { row: 2, fromColumn: 0, toColumn: 0, collision: 'solid' },
    ]);
  });
});

describe('CourseBot', () => {
  it('climbs a small tower to the top ledge using the controller', () => {
    const bot = new CourseBot(tower, tuning);
    let body = createPlatformerBody(48, 14 * 32, tuning);
    let jumpWasDown = false;
    let best = Infinity;
    for (let step = 0; step < 120 * 30 && best > 32; step += 1) {
      const buttons = bot.decide(body);
      body = stepPlatformer(
        body,
        {
          left: buttons.left,
          right: buttons.right,
          jumpHeld: buttons.jump,
          jumpPressed: buttons.jump && !jumpWasDown,
        },
        tower,
        tuning,
        1 / 120,
      ).body;
      jumpWasDown = buttons.jump;
      if (body.onGround) best = Math.min(best, footOf(body, tuning).y);
    }
    expect(best).toBe(32);
  });
});
