import type { GameSession, PresentedQuestion } from '@teckin/game-contracts';
import { CourseBot } from '@teckin/platformer-kit';
import type { ClimberCourse } from '../course/course';
import type { ClimberTunables } from '../tunables';
import { ClimberRun } from './climber-run';

/** Options for {@link simulateClimb}. */
export interface SimulateClimbOptions {
  course: ClimberCourse;
  tunables: ClimberTunables;
  session: GameSession;
  /** Picks an option id for a question: the scripted player's answer. */
  chooseAnswer: (question: PresentedQuestion) => string;
  /** Simulated seconds the player spends reading and answering one question. */
  secondsPerAnswer: number;
  /** Extra seconds a wrong answer costs (the 2-second reveal). */
  wrongAnswerSeconds?: number;
  /** Seconds to open and close the sheet once. */
  sheetOverheadSeconds?: number;
  /** Open the sheet when energy drops below this. */
  askBelow: number;
  /** Answer until energy reaches this, then close the sheet. */
  refillTo: number;
  /** Give up after this much simulated time. */
  maxSimulatedSeconds?: number;
}

/** Outcome of {@link simulateClimb}. */
export interface SimulatedClimb {
  finished: boolean;
  /** Climbing plus answering time, seconds. */
  totalSeconds: number;
  climbSeconds: number;
  answeringSeconds: number;
  summitsReached: number;
  /** Time at which each summit was reached, total seconds. */
  summitTimes: number[];
  sheetVisits: number;
  questionsAnswered: number;
  correctAnswers: number;
  jumps: number;
  airJumps: number;
  energySpent: number;
}

/**
 * Plays a whole solo game without a browser: the course bot climbs through a real
 * {@link ClimberRun}, and whenever energy runs low a scripted player answers questions
 * through the {@link GameSession}, exactly as the sheet would. Used by the acceptance test
 * (a full run with each sample set) and by the balance playtests in `docs/playtests.md`.
 */
export async function simulateClimb(options: SimulateClimbOptions): Promise<SimulatedClimb> {
  const { course, tunables, session } = options;
  const physics = tunables.physics;
  let energySpent = 0;
  const energy = {
    get energy() {
      return session.energy;
    },
    spendEnergy: (amount: number, reason: string) => {
      const spent = session.spendEnergy(amount, reason);
      if (spent) energySpent += amount;
      return spent;
    },
  };
  const run = new ClimberRun(course, tunables, energy, false);
  const bot = new CourseBot(course.map.grid, physics);
  const maxSeconds = options.maxSimulatedSeconds ?? 60 * 60;
  const result: SimulatedClimb = {
    finished: false,
    totalSeconds: 0,
    climbSeconds: 0,
    answeringSeconds: 0,
    summitsReached: 0,
    summitTimes: [],
    sheetVisits: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    jumps: 0,
    airJumps: 0,
    energySpent: 0,
  };
  let jumpWasDown = false;

  while (!run.completed && result.climbSeconds + result.answeringSeconds < maxSeconds) {
    if (session.energy < options.askBelow) {
      result.sheetVisits += 1;
      result.answeringSeconds += options.sheetOverheadSeconds ?? 2;
      while (session.energy < options.refillTo) {
        const question = await session.currentQuestion();
        const outcome = await session.submitAnswer(question.id, options.chooseAnswer(question));
        result.questionsAnswered += 1;
        result.answeringSeconds += options.secondsPerAnswer;
        if (outcome.isCorrect) result.correctAnswers += 1;
        else result.answeringSeconds += options.wrongAnswerSeconds ?? 2;
      }
      jumpWasDown = false;
    }
    const buttons = bot.decide(run.body);
    const step = run.step({
      left: buttons.left,
      right: buttons.right,
      jumpHeld: buttons.jump,
      jumpPressed: buttons.jump && !jumpWasDown,
    });
    jumpWasDown = buttons.jump;
    result.climbSeconds += physics.fixedStep;
    for (const event of step.events) {
      if (event === 'jump') result.jumps += 1;
      if (event === 'airJump') result.airJumps += 1;
    }
    if (step.reachedSummit !== undefined) {
      result.summitsReached = step.reachedSummit + 1;
      result.summitTimes.push(result.climbSeconds + result.answeringSeconds);
    }
  }
  result.finished = run.completed;
  result.totalSeconds = result.climbSeconds + result.answeringSeconds;
  result.energySpent = energySpent;
  return result;
}
