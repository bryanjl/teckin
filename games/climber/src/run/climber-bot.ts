import { CourseBot, footOf, type Box } from '@teckin/platformer-kit';
import type { ClimberRun } from './climber-run';

/**
 * The course bot set up for a Climber run: it sees moving ledges where they are now and
 * waits on the ground while a spark barrier on its way up is on or about to switch on.
 * Used by the in-game autopilot and the headless playtests.
 */
export function createClimberBot(run: ClimberRun, waitForBarrierSeconds = 1.1): CourseBot {
  const { physics } = run.tunables;
  const size = physics.tileSize;
  return new CourseBot(run.course.map.grid, physics, 5, {
    movingLedges: () => run.hazards.dynamicLedges(),
    shouldWait: (body, target) => {
      if (!target) return false;
      const foot = footOf(body, physics);
      const left = Math.min(foot.x - 2 * size, target.fromColumn * size);
      const right = Math.max(foot.x + 2 * size, (target.toColumn + 1) * size);
      const area: Box = {
        x: left,
        y: (target.row - 2) * size,
        width: right - left,
        height: foot.y - (target.row - 2) * size,
      };
      return run.hazards.barrierThreatens(area, waitForBarrierSeconds);
    },
  });
}
