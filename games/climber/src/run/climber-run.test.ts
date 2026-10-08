import { describe, expect, it } from 'vitest';
import { bundledCourseMap, createClimberCourse } from '../course/course';
import { defaultClimberTunables } from '../tunables';
import { ClimberRun, type EnergyAccount } from './climber-run';
import { energyLimits } from './energy-rules';

const tunables = defaultClimberTunables;
const course = createClimberCourse(bundledCourseMap, tunables);

class TestEnergy implements EnergyAccount {
  readonly log: { amount: number; reason: string }[] = [];
  constructor(public energy: number) {}
  spendEnergy(amount: number, reason: string): boolean {
    if (amount > this.energy) return false;
    this.energy -= amount;
    this.log.push({ amount, reason });
    return true;
  }
}

const idle = { left: false, right: false, jumpHeld: false, jumpPressed: false };

function settle(run: ClimberRun): void {
  for (let step = 0; step < 60; step += 1) run.step(idle);
  expect(run.body.onGround).toBe(true);
}

describe('ClimberRun energy', () => {
  it('spends nothing while standing still or falling', () => {
    const energy = new TestEnergy(50);
    const run = new ClimberRun(course, tunables, energy, false);
    settle(run);
    for (let step = 0; step < 240; step += 1) run.step(idle);
    expect(energy.energy).toBe(50);
  });

  it('charges the jump cost for a jump and the double-jump cost for an air jump', () => {
    const energy = new TestEnergy(100);
    const run = new ClimberRun(course, tunables, energy, false);
    settle(run);
    run.step({ ...idle, jumpHeld: true, jumpPressed: true });
    for (let step = 0; step < 20; step += 1) run.step({ ...idle, jumpHeld: true });
    run.step({ ...idle, jumpHeld: false });
    run.step({ ...idle, jumpHeld: true, jumpPressed: true });
    expect(energy.log).toEqual([
      { amount: tunables.jumpCost, reason: 'jump' },
      { amount: tunables.doubleJumpCost, reason: 'airJump' },
    ]);
  });

  it('charges the walking cost once per whole tile moved', () => {
    const energy = new TestEnergy(100);
    const run = new ClimberRun(course, tunables, energy, false);
    settle(run);
    const startX = run.body.x;
    while (Math.abs(run.body.x - startX) < tunables.physics.tileSize * 3.5) {
      run.step({ ...idle, right: run.body.x < 250, left: run.body.x >= 250 });
    }
    const walked = energy.log.filter((entry) => entry.reason === 'walk');
    expect(walked).toHaveLength(3);
    expect(walked.every((entry) => entry.amount === tunables.walkingCostPerTile)).toBe(true);
  });

  it('cannot jump without the full cost, and crawls slowly for free at zero', () => {
    const energy = new TestEnergy(tunables.jumpCost - 1);
    const run = new ClimberRun(course, tunables, energy, false);
    settle(run);
    run.step({ ...idle, jumpHeld: true, jumpPressed: true });
    for (let step = 0; step < 30; step += 1) run.step({ ...idle, jumpHeld: true });
    expect(run.body.onGround).toBe(true);
    expect(energy.energy).toBe(tunables.jumpCost - 1);

    energy.energy = 0;
    for (let step = 0; step < 120; step += 1) run.step({ ...idle, right: true });
    expect(Math.abs(run.body.velocityX)).toBeCloseTo(
      tunables.physics.runSpeed * tunables.crawlSpeedScale,
      0,
    );
    expect(energy.energy).toBe(0);
    expect(run.crawling).toBe(true);
  });

  it('describes the limits for each energy level', () => {
    expect(energyLimits(0, tunables)).toMatchObject({ crawling: true, groundJumpAllowed: false });
    expect(energyLimits(10, tunables)).toMatchObject({
      crawling: false,
      groundJumpAllowed: true,
      airJumpAllowed: false,
      speedScale: 1,
    });
    expect(energyLimits(15, tunables)).toMatchObject({ airJumpAllowed: true });
  });
});
