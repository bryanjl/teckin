import { describe, expect, it } from 'vitest';
import {
  FixedStepper,
  createPlatformerBody,
  footOf,
  stepPlatformer,
  type PlatformerBody,
  type PlatformerEvent,
  type PlatformerInput,
} from './controller';
import { gridFromAscii } from './testing/ascii-grid';
import { testTuning as tuning } from './testing/tuning';

const dt = 1 / 120;
const idle: PlatformerInput = { left: false, right: false, jumpHeld: false, jumpPressed: false };

// 16 columns, floor at row 10 (y = 320) with a gap from column 8 on.
const grid = gridFromAscii([
  ...Array.from({ length: 10 }, () => '................'),
  '########........',
  '################',
]);

function run(
  body: PlatformerBody,
  steps: number,
  input: PlatformerInput | ((step: number) => PlatformerInput),
): { body: PlatformerBody; events: PlatformerEvent[] } {
  let current = body;
  const events: PlatformerEvent[] = [];
  for (let step = 0; step < steps; step += 1) {
    const result = stepPlatformer(
      current,
      typeof input === 'function' ? input(step) : input,
      grid,
      tuning,
      dt,
    );
    current = result.body;
    events.push(...result.events);
  }
  return { body: current, events };
}

function standingAt(footX: number): PlatformerBody {
  return run(createPlatformerBody(footX, 320, tuning), 2, idle).body;
}

/** Highest point the feet reach while `input` is applied. */
function peakHeight(body: PlatformerBody, input: (step: number) => PlatformerInput): number {
  let current = body;
  let best = footOf(current, tuning).y;
  for (let step = 0; step < 240; step += 1) {
    current = stepPlatformer(current, input(step), grid, tuning, dt).body;
    best = Math.min(best, footOf(current, tuning).y);
  }
  return footOf(body, tuning).y - best;
}

const press = (step: number): PlatformerInput => ({
  ...idle,
  jumpHeld: true,
  jumpPressed: step === 0,
});

describe('stepPlatformer', () => {
  it('stands on the floor', () => {
    const body = standingAt(64);
    expect(body.onGround).toBe(true);
    expect(footOf(body, tuning).y).toBe(320);
  });

  it('accelerates to run speed and stops at walls', () => {
    const body = run(standingAt(64), 60, { ...idle, left: true }).body;
    expect(body.x).toBe(0);
    expect(body.facing).toBe(-1);
    const running = run(standingAt(64), 30, { ...idle, right: true }).body;
    expect(running.velocityX).toBe(tuning.runSpeed);
  });

  it('jumps about v²/2g high when jump is held', () => {
    const height = peakHeight(standingAt(64), press);
    const expected = tuning.jumpVelocity ** 2 / (2 * tuning.gravity);
    expect(height).toBeGreaterThan(expected * 0.95);
    expect(height).toBeLessThan(expected * 1.05);
  });

  it('makes a short hop when jump is released early (variable height)', () => {
    const full = peakHeight(standingAt(64), press);
    const short = peakHeight(standingAt(64), (step) => ({
      ...idle,
      jumpPressed: step === 0,
      jumpHeld: step < 6,
    }));
    expect(short).toBeLessThan(full * 0.5);
    expect(short).toBeGreaterThan(0);
  });

  it('double jumps once in mid-air, then no more until landing', () => {
    const single = peakHeight(standingAt(64), press);
    const double = peakHeight(standingAt(64), (step) => ({
      ...idle,
      jumpHeld: true,
      jumpPressed: step === 0 || step === 40,
    }));
    expect(double).toBeGreaterThan(single * 1.5);
    const triple = peakHeight(standingAt(64), (step) => ({
      ...idle,
      jumpHeld: true,
      jumpPressed: step === 0 || step === 40 || step === 80,
    }));
    expect(triple).toBeCloseTo(double, 0);
  });

  it('still allows a ground jump just after walking off a ledge (coyote time)', () => {
    // Walk right until the feet leave the floor at column 8, then press jump 50 ms later.
    let body = standingAt(240);
    let stepsSinceLeaving = -1;
    let events: PlatformerEvent[] = [];
    for (let step = 0; step < 200 && stepsSinceLeaving < 6; step += 1) {
      const result = stepPlatformer(
        body,
        {
          ...idle,
          right: true,
          jumpHeld: stepsSinceLeaving === 5,
          jumpPressed: stepsSinceLeaving === 5,
        },
        grid,
        tuning,
        dt,
      );
      body = result.body;
      events = result.events;
      if (stepsSinceLeaving >= 0) stepsSinceLeaving += 1;
      if (result.events.includes('leaveGround')) stepsSinceLeaving = 0;
    }
    expect(events).toContain('jump');
    expect(body.airJumpsUsed).toBe(0);
  });

  it('turns a late jump press into an air jump once coyote time has run out', () => {
    let body = standingAt(240);
    let left = -1;
    let lastEvents: PlatformerEvent[] = [];
    for (let step = 0; step < 300 && left < 20; step += 1) {
      const pressNow = left === 19;
      const result = stepPlatformer(
        body,
        { ...idle, right: true, jumpHeld: pressNow, jumpPressed: pressNow },
        grid,
        tuning,
        dt,
      );
      body = result.body;
      lastEvents = result.events;
      if (left >= 0) left += 1;
      if (result.events.includes('leaveGround')) left = 0;
    }
    expect(lastEvents).toContain('airJump');
  });

  it('jumps on landing when jump was pressed just before (jump buffer)', () => {
    // Jump, use the air jump, then press again shortly before touching down.
    let body = standingAt(64);
    let landedJump = false;
    const pressSteps = new Set([0, 30]);
    for (let step = 0; step < 400 && !landedJump; step += 1) {
      const nearFloor = body.velocityY > 0 && footOf(body, tuning).y > 320 - 8;
      const pressed = pressSteps.has(step) || (step > 30 && nearFloor && !pressSteps.has(-1));
      if (step > 30 && nearFloor) pressSteps.add(-1);
      const result = stepPlatformer(
        body,
        { ...idle, jumpHeld: true, jumpPressed: pressed },
        grid,
        tuning,
        dt,
      );
      body = result.body;
      if (step > 30 && result.events.includes('jump')) landedJump = true;
    }
    expect(landedJump).toBe(true);
  });

  it('keeps a jump press about 80 ms before landing (jump buffer near its full length)', () => {
    // Jump at step 0, air jump at step 30, then fall back to the floor.
    const pressAt = (extra: number | undefined) => (step: number) => {
      const pressed = step === 0 || step === 30 || step === extra;
      return { ...idle, jumpHeld: pressed, jumpPressed: pressed };
    };
    const playOut = (extra: number | undefined): { landStep: number; jumpStep: number } => {
      let body = standingAt(64);
      let landStep = -1;
      let jumpStep = -1;
      for (let step = 0; step < 400; step += 1) {
        const result = stepPlatformer(body, pressAt(extra)(step), grid, tuning, dt);
        body = result.body;
        if (step > 30 && landStep < 0 && result.events.includes('land')) landStep = step;
        if (step > 30 && jumpStep < 0 && result.events.includes('jump')) jumpStep = step;
      }
      return { landStep, jumpStep };
    };
    const { landStep } = playOut(undefined);
    expect(landStep).toBeGreaterThan(40);
    const bufferedSteps = Math.round(0.08 / dt);
    const buffered = playOut(landStep - bufferedSteps);
    expect(buffered.jumpStep).toBeGreaterThanOrEqual(landStep);
    expect(buffered.jumpStep).toBeLessThanOrEqual(landStep + 1);
  });

  it('ignores a jump pressed long before landing', () => {
    let body = standingAt(64);
    let jumps = 0;
    for (let step = 0; step < 400; step += 1) {
      const result = stepPlatformer(
        body,
        { ...idle, jumpHeld: true, jumpPressed: step === 0 || step === 30 || step === 60 },
        grid,
        tuning,
        dt,
      );
      body = result.body;
      jumps += result.events.filter((event) => event === 'jump').length;
    }
    // Step 60 is long before landing (a full jump lasts ~100 steps), so only one ground jump.
    expect(jumps).toBe(1);
    expect(body.onGround).toBe(true);
  });

  it('falls until it lands on something lower, then reports the landing', () => {
    const { body, events } = run(standingAt(240), 200, { ...idle, right: true });
    expect(events).toContain('leaveGround');
    expect(events).toContain('land');
    expect(footOf(body, tuning).y).toBe(352);
  });
});

describe('FixedStepper', () => {
  it('runs whole steps and carries the remainder', () => {
    const stepper = new FixedStepper(0.01);
    let steps = 0;
    const remainder = stepper.advance(0.025, () => (steps += 1));
    expect(steps).toBe(2);
    expect(remainder).toBeCloseTo(0.5);
    stepper.advance(0.005, () => (steps += 1));
    expect(steps).toBe(3);
  });

  it('caps a long stall', () => {
    const stepper = new FixedStepper(0.01, 0.05);
    let steps = 0;
    stepper.advance(3, () => (steps += 1));
    expect(steps).toBe(5);
  });
});
