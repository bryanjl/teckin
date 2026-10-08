import type { AnswerOutcome, EnergySpendReason, GameSession } from '@teckin/game-contracts';
import { createSeededRandom, sampleQuestionSets } from '@teckin/questions';
import { LocalSession } from '@teckin/session';
import { describe, expect, it } from 'vitest';
import { bundledCourseMap, createClimberCourse } from '../course/course';
import { simulateClimb } from '../run/simulate-climb';
import { defaultClimberTunables } from '../tunables';
import {
  MovementReferee,
  movementLimitsFor,
  permanentWalls,
  type MoveVerdict,
} from './movement-referee';

const tunables = defaultClimberTunables;
const course = createClimberCourse(bundledCourseMap, tunables);
const limits = movementLimitsFor(course, tunables);
const tile = tunables.physics.tileSize;

function createReferee(nowMs = 0) {
  return new MovementReferee(course, tunables, limits, permanentWalls(course), nowMs);
}

/** A session that tells the referee about each paid jump, as the room does. */
function refereedSession(inner: LocalSession, referee: MovementReferee): GameSession {
  return {
    get energy() {
      return inner.energy;
    },
    currentQuestion: () => inner.currentQuestion(),
    submitAnswer: (questionId, optionId): Promise<AnswerOutcome> =>
      inner.submitAnswer(questionId, optionId),
    spendEnergy: (amount: number, reason: EnergySpendReason) => {
      const paid = inner.spendEnergy(amount, reason);
      if (paid && (reason === 'jump' || reason === 'airJump'))
        referee.payJump(reason as 'jump' | 'airJump');
      return paid;
    },
    reportProgress: (event) => inner.reportProgress(event),
    onEnergyChange: (listener) => inner.onEnergyChange(listener),
    answerSummary: () => inner.answerSummary(),
    reset: () => inner.reset(),
  };
}

describe('MovementReferee', () => {
  it('accepts every report of an honest climb to the top and awards all six summits in order', async () => {
    const referee = createReferee();
    const local = new LocalSession({
      questionSet: sampleQuestionSets.maths,
      startingEnergy: tunables.startingEnergy,
      energyPerCorrectAnswer: 100,
      random: createSeededRandom(3),
    });
    const verdicts: MoveVerdict[] = [];
    let steps = 0;
    const result = await simulateClimb({
      course,
      tunables,
      session: refereedSession(local, referee),
      chooseAnswer: (question) => local.correctOptionFor(question.id),
      secondsPerAnswer: 5,
      askBelow: tunables.jumpCost + tunables.doubleJumpCost + 10,
      refillTo: 200,
      onStep: (run) => {
        steps += 1;
        // Ten reports a second, timed by climbing time only (the strictest clock).
        if (steps % 12 !== 0 && !run.completed) return;
        verdicts.push(
          referee.review(
            {
              x: run.foot.x,
              y: run.foot.y,
              onGround: run.body.onGround,
              summits: run.progress.goalsReached,
            },
            steps * tunables.physics.fixedStep * 1000,
          ),
        );
      },
    });
    expect(result.finished).toBe(true);
    expect(verdicts.filter((verdict) => !verdict.accepted)).toEqual([]);
    expect(
      verdicts.flatMap((verdict) =>
        verdict.accepted && verdict.reachedSummit !== undefined ? [verdict.reachedSummit] : [],
      ),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(referee.finished).toBe(true);
  }, 30_000);

  it('refuses rising without a paid jump, and more than the paid jumps allow', () => {
    const referee = createReferee();
    const { x, y } = course.spawn;
    expect(referee.review({ x, y: y - 3 * tile, onGround: false, summits: 0 }, 100)).toEqual({
      accepted: false,
      reason: 'tooHigh',
    });
    referee.payJump('jump');
    // A ground jump reaches about 3.5 tiles; 5 tiles needs the double jump as well.
    expect(referee.review({ x, y: y - 5 * tile, onGround: false, summits: 0 }, 200).accepted).toBe(
      false,
    );
    expect(referee.review({ x, y: y - 3 * tile, onGround: false, summits: 0 }, 300).accepted).toBe(
      true,
    );
    referee.payJump('airJump');
    expect(
      referee.review({ x, y: y - 5.5 * tile, onGround: false, summits: 0 }, 400).accepted,
    ).toBe(true);
    // Standing again clears what is left of the allowance.
    expect(referee.review({ x, y: y - 5.5 * tile, onGround: true, summits: 0 }, 500).accepted).toBe(
      true,
    );
    expect(referee.review({ x, y: y - 6.5 * tile, onGround: false, summits: 0 }, 600)).toEqual({
      accepted: false,
      reason: 'tooHigh',
    });
    expect(referee.foot.y).toBe(y - 5.5 * tile);
  });

  it('refuses moving sideways faster than possible, positions outside the course and inside walls', () => {
    const referee = createReferee();
    const { x, y } = course.spawn;
    const farSide = x > 6 * tile ? tile : 11 * tile;
    // A burst is allowed (bunched reports), but crossing the course instantly twice is not.
    referee.review({ x: farSide, y, onGround: true, summits: 0 }, 0);
    expect(referee.review({ x, y, onGround: true, summits: 0 }, 10)).toEqual({
      accepted: false,
      reason: 'tooFast',
    });
    expect(referee.review({ x: -50, y, onGround: true, summits: 0 }, 2000)).toEqual({
      accepted: false,
      reason: 'outsideCourse',
    });
    // The floor row under the spawn is solid: feet a tile below the floor are inside it.
    expect(
      referee.review({ x: referee.foot.x, y: y + tile, onGround: true, summits: 0 }, 4000),
    ).toEqual({
      accepted: false,
      reason: 'insideWall',
    });
  });

  it('awards summits only in order and only where the player is', () => {
    // Generous limits so only the summit rule is under test.
    const referee = new MovementReferee(
      course,
      tunables,
      { ...limits, maxHorizontalSpeed: 1e6, riseTolerance: 1e6 },
      permanentWalls(course),
      0,
    );
    const [first, second] = course.summits;
    // Claiming every summit while standing at the start reaches nothing.
    expect(
      referee.review({ x: course.spawn.x, y: course.spawn.y, onGround: true, summits: 6 }, 100),
    ).toEqual({ accepted: true, finished: false });
    // Standing on summit 2 before summit 1 counts for nothing.
    expect(
      referee.review({ x: second!.respawnX, y: second!.respawnY, onGround: true, summits: 2 }, 200),
    ).toEqual({ accepted: true, finished: false });
    expect(referee.summitsReached).toBe(0);
    expect(
      referee.review({ x: first!.respawnX, y: first!.respawnY, onGround: true, summits: 0 }, 300),
    ).toEqual({ accepted: true, reachedSummit: 0, finished: false });
    expect(
      referee.review({ x: second!.respawnX, y: second!.respawnY, onGround: true, summits: 2 }, 400),
    ).toEqual({ accepted: true, reachedSummit: 1, finished: false });
    expect(Math.round(referee.heightMetres)).toBe(Math.round(tunables.courseHeightMetres / 3));
  });

  it('respawns at the last summit only when checkpoints are on and one was reached', () => {
    const referee = new MovementReferee(
      course,
      tunables,
      { ...limits, maxHorizontalSpeed: 1e6, riseTolerance: 1e6 },
      permanentWalls(course),
      0,
    );
    expect(referee.respawnAtCheckpoint(true, 0)).toBeNull();
    const first = course.summits[0]!;
    referee.review({ x: first.respawnX, y: first.respawnY, onGround: true, summits: 1 }, 100);
    referee.review({ x: course.spawn.x, y: course.spawn.y, onGround: true, summits: 1 }, 200);
    expect(referee.respawnAtCheckpoint(false, 300)).toBeNull();
    expect(referee.respawnAtCheckpoint(true, 300)).toEqual({
      x: first.respawnX,
      y: first.respawnY,
    });
    expect(referee.foot).toEqual({ x: first.respawnX, y: first.respawnY });
  });
});
