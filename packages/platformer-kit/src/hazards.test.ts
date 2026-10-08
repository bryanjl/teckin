import { describe, expect, it } from 'vitest';
import { createPlatformerBody, footOf, type PlatformerInput } from './controller';
import {
  HazardField,
  crumblingLedgesFromTiles,
  isZoneOn,
  movingPlatformBox,
  secondsUntilOn,
  type HazardLayout,
} from './hazards';
import { gridFromAscii } from './testing/ascii-grid';
import { testTuning as tuning } from './testing/tuning';

const dt = 1 / 120;
const idle: PlatformerInput = { left: false, right: false, jumpHeld: false, jumpPressed: false };

// 16 columns, solid floor at row 10 (y = 320), one-way ledge at row 7 columns 2-4.
const rows = () =>
  gridFromAscii([
    ...Array.from({ length: 7 }, () => '................'),
    '..===...........',
    '................',
    '................',
    '################',
    '################',
  ]);

const emptyLayout = (): HazardLayout => ({
  movingPlatforms: [],
  vents: [],
  barriers: [],
  crumblingLedges: [],
  crumbleDelaySeconds: 0.5,
  crumbleRespawnSeconds: 2,
  barrierKnockSpeed: 300,
});

function settle(field: HazardField, footX: number, footY = 320) {
  let body = createPlatformerBody(footX, footY, tuning);
  for (let step = 0; step < 30; step += 1) body = field.step(body, idle, tuning, dt).body;
  return body;
}

describe('timed zones', () => {
  const zone = {
    id: 'z',
    zone: { x: 0, y: 0, width: 10, height: 10 },
    onSeconds: 1,
    offSeconds: 2,
    offsetSeconds: 0,
  };
  it('switch on and off on a fixed cycle', () => {
    expect(isZoneOn(zone, 0.5)).toBe(true);
    expect(isZoneOn(zone, 1.5)).toBe(false);
    expect(isZoneOn(zone, 3.2)).toBe(true);
    expect(secondsUntilOn(zone, 1.5)).toBeCloseTo(1.5);
    expect(secondsUntilOn(zone, 0.2)).toBe(0);
  });
});

describe('moving platforms', () => {
  const spec = {
    id: 'm',
    x: 256,
    y: 256,
    width: 96,
    height: 32,
    travelX: 128,
    periodSeconds: 4,
    phase: 0,
  };

  it('ease from one end to the other and back', () => {
    expect(movingPlatformBox(spec, 0).x).toBeCloseTo(256);
    expect(movingPlatformBox(spec, 2).x).toBeCloseTo(384);
    expect(movingPlatformBox(spec, 4).x).toBeCloseTo(256);
  });

  it('catch a falling player and carry them along', () => {
    const field = new HazardField({ ...emptyLayout(), movingPlatforms: [spec] }, rows());
    const events: string[] = [];
    let body = createPlatformerBody(304, 200, tuning);
    for (let step = 0; step < 40; step += 1) {
      const result = field.step(body, idle, tuning, dt);
      body = result.body;
      events.push(...result.events);
    }
    expect(body.onGround).toBe(true);
    expect(footOf(body, tuning).y).toBeCloseTo(256);
    expect(events).toContain('land');
    const before = body.x;
    let pushed = 0;
    for (let step = 0; step < 120; step += 1) {
      const result = field.step(body, idle, tuning, dt);
      body = result.body;
      pushed += result.pushedX;
      expect(result.events).not.toContain('leaveGround');
    }
    expect(body.onGround).toBe(true);
    expect(body.x).toBeGreaterThan(before + 20);
    // The ride is reported as pushed movement, so it can be kept free of walking costs.
    expect(pushed).toBeCloseTo(body.x - before, 5);
  });

  it('can be jumped up through from below', () => {
    const field = new HazardField(
      { ...emptyLayout(), movingPlatforms: [{ ...spec, travelX: 0 }] },
      rows(),
    );
    let body = settle(field, 304);
    body = field.step(body, { ...idle, jumpHeld: true, jumpPressed: true }, tuning, dt).body;
    let landedOnPlatform = false;
    for (let step = 0; step < 120; step += 1) {
      body = field.step(body, { ...idle, jumpHeld: true }, tuning, dt).body;
      if (body.onGround && Math.abs(footOf(body, tuning).y - 256) < 1) landedOnPlatform = true;
    }
    expect(landedOnPlatform).toBe(true);
  });
});

describe('vents', () => {
  it('push sideways while on and not while off', () => {
    const vent = {
      id: 'v',
      zone: { x: 0, y: 200, width: 512, height: 120 },
      onSeconds: 1,
      offSeconds: 1,
      offsetSeconds: 0,
      pushSpeed: 100,
    };
    const field = new HazardField({ ...emptyLayout(), vents: [vent] }, rows());
    let body = settle(field, 200);
    const start = body.x;
    for (let step = 0; step < 60; step += 1) body = field.step(body, idle, tuning, dt).body;
    const whileOn = body.x - start;
    for (let step = 0; step < 120; step += 1) body = field.step(body, idle, tuning, dt).body;
    const afterOff = body.x;
    for (let step = 0; step < 60; step += 1) body = field.step(body, idle, tuning, dt).body;
    expect(whileOn).toBeGreaterThan(10);
    // From 1.25 s to 1.75 s the vent is off: the last half second had no push… then on again.
    expect(body.x).toBeGreaterThan(afterOff);
  });
});

describe('barriers', () => {
  it('knock the player down and use up the double jump while on', () => {
    const barrier = {
      id: 'b',
      zone: { x: 0, y: 250, width: 512, height: 8 },
      onSeconds: 10,
      offSeconds: 1,
      offsetSeconds: 0,
    };
    const field = new HazardField({ ...emptyLayout(), barriers: [barrier] }, rows());
    let body = settle(field, 300);
    body = field.step(body, { ...idle, jumpHeld: true, jumpPressed: true }, tuning, dt).body;
    const events: string[] = [];
    for (let step = 0; step < 60; step += 1) {
      const result = field.step(body, { ...idle, jumpHeld: true }, tuning, dt);
      body = result.body;
      events.push(...result.events);
    }
    expect(events).toContain('knockedDown');
    expect(footOf(body, tuning).y).toBeGreaterThan(250);
  });

  it('report when they threaten an area soon', () => {
    const barrier = {
      id: 'b',
      zone: { x: 0, y: 100, width: 64, height: 8 },
      onSeconds: 1,
      offSeconds: 3,
      offsetSeconds: 1.5,
    };
    const field = new HazardField({ ...emptyLayout(), barriers: [barrier] }, rows());
    const area = { x: 0, y: 50, width: 64, height: 100 };
    expect(field.barrierThreatens(area, 1)).toBe(false);
    expect(field.barrierThreatens(area, 3)).toBe(true);
    expect(field.barrierThreatens({ ...area, x: 200 }, 3)).toBe(false);
  });
});

describe('crumbling ledges', () => {
  it('group marked tiles into ledges', () => {
    expect(
      crumblingLedgesFromTiles([
        { column: 2, row: 7, hazard: 'crumbling' },
        { column: 3, row: 7, hazard: 'crumbling' },
        { column: 6, row: 7, hazard: 'crumbling' },
        { column: 4, row: 7 },
      ]),
    ).toEqual([
      { row: 7, fromColumn: 2, toColumn: 3 },
      { row: 7, fromColumn: 6, toColumn: 6 },
    ]);
  });

  it('shake when stood on, fall away, then come back once clear', () => {
    const grid = rows();
    const field = new HazardField(
      { ...emptyLayout(), crumblingLedges: [{ row: 7, fromColumn: 2, toColumn: 4 }] },
      grid,
    );
    let body = settle(field, 112, 224);
    expect(field.crumblingStates()[0]?.state).toBe('shaking');
    const events: string[] = [];
    for (let step = 0; step < 90; step += 1) {
      const result = field.step(body, idle, tuning, dt);
      body = result.body;
      events.push(...result.events);
    }
    expect(events).toContain('crumbled');
    expect(field.crumblingStates()[0]?.state).toBe('gone');
    expect(grid.at(3, 7)).toBe('empty');
    expect(footOf(body, tuning).y).toBeCloseTo(320);
    for (let step = 0; step < 2.1 * 120; step += 1) body = field.step(body, idle, tuning, dt).body;
    expect(field.crumblingStates()[0]?.state).toBe('intact');
    expect(grid.at(3, 7)).toBe('oneWay');
    field.reset();
    expect(field.seconds).toBe(0);
  });
});
