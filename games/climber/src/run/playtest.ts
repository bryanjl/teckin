import type { GameSession, PresentedQuestion } from '@teckin/game-contracts';
import { bundledCourseMap, createClimberCourse } from '../course/course';
import { defaultClimberSettings } from '../settings';
import { defaultClimberTunables, type ClimberTunables } from '../tunables';
import { simulateClimb, type SimulatedClimb } from './simulate-climb';

/** How a scripted player answers and how often they top up. */
export interface PlayerProfile {
  name: string;
  /** Chance of answering correctly, 0 to 1. */
  accuracy: number;
  /** Seconds to read and answer one question. */
  secondsPerAnswer: number;
  /** Opens the sheet below this much energy. */
  askBelow: number;
  /** Answers until energy reaches this. */
  refillTo: number;
  /** Seconds of hesitation after each landing (a person is slower than the bot). */
  pauseAfterLandingSeconds: number;
  /** Chance a jump is fumbled (short hop, no double jump). */
  fumbleRate: number;
}

/** The profiles the balance is judged by. "Skilled" must finish in 8 to 12 minutes. */
export const playerProfiles: readonly PlayerProfile[] = [
  {
    name: 'skilled',
    accuracy: 0.9,
    secondsPerAnswer: 8,
    askBelow: 50,
    refillTo: 250,
    pauseAfterLandingSeconds: 0.5,
    fumbleRate: 0.06,
  },
  {
    name: 'average',
    accuracy: 0.75,
    secondsPerAnswer: 10,
    askBelow: 40,
    refillTo: 200,
    pauseAfterLandingSeconds: 0.8,
    fumbleRate: 0.12,
  },
  {
    name: 'struggling',
    accuracy: 0.55,
    secondsPerAnswer: 14,
    askBelow: 30,
    refillTo: 150,
    pauseAfterLandingSeconds: 1,
    fumbleRate: 0.18,
  },
];

/** Something that can build a session for a playtest (the real `LocalSession` in practice). */
export type PlaytestSessionFactory = (options: {
  setId: string;
  seed: number;
  startingEnergy: number;
  energyPerCorrectAnswer: number;
}) => GameSession & { correctOptionFor(questionId: string): string };

/** One playtest run. */
export interface PlaytestResult {
  profile: string;
  setId: string;
  seed: number;
  climb: SimulatedClimb;
}

/** Options for {@link runPlaytests}. */
export interface RunPlaytestsOptions {
  createSession: PlaytestSessionFactory;
  setIds: readonly string[];
  seeds?: readonly number[];
  profiles?: readonly PlayerProfile[];
  tunables?: ClimberTunables;
  energyPerCorrectAnswer?: number;
}

/** Deterministic pseudo-random sequence for scripted mistakes. */
function mistakes(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return state / 4294967296;
  };
}

/** Plays every profile × set × seed and returns the results. */
export async function runPlaytests(options: RunPlaytestsOptions): Promise<PlaytestResult[]> {
  const tunables = options.tunables ?? defaultClimberTunables;
  const course = createClimberCourse(bundledCourseMap, tunables);
  const results: PlaytestResult[] = [];
  for (const profile of options.profiles ?? playerProfiles) {
    for (const setId of options.setIds) {
      for (const seed of options.seeds ?? [1, 2, 3, 4, 5, 6]) {
        const session = options.createSession({
          setId,
          seed,
          startingEnergy: tunables.startingEnergy,
          energyPerCorrectAnswer:
            options.energyPerCorrectAnswer ?? defaultClimberSettings.energyPerCorrectAnswer,
        });
        const roll = mistakes(seed);
        const chooseAnswer = (question: PresentedQuestion): string => {
          const correct = session.correctOptionFor(question.id);
          if (roll() < profile.accuracy) return correct;
          return question.options.find((option) => option.id !== correct)?.id ?? correct;
        };
        const climb = await simulateClimb({
          course,
          tunables,
          session,
          chooseAnswer,
          secondsPerAnswer: profile.secondsPerAnswer,
          askBelow: profile.askBelow,
          refillTo: profile.refillTo,
          maxSimulatedSeconds: 45 * 60,
          pauseAfterLandingSeconds: profile.pauseAfterLandingSeconds,
          fumbleRate: profile.fumbleRate,
          random: mistakes(seed * 7919),
        });
        results.push({ profile: profile.name, setId, seed, climb });
      }
    }
  }
  return results;
}

const minutes = (seconds: number): string => (seconds / 60).toFixed(1);

/** Average total minutes for one profile. */
export function averageMinutes(results: readonly PlaytestResult[], profile: string): number {
  const runs = results.filter((result) => result.profile === profile);
  return runs.reduce((sum, run) => sum + run.climb.totalSeconds, 0) / runs.length / 60;
}

/** A Markdown table of the results, one row per profile and set (seeds averaged). */
export function playtestReport(results: readonly PlaytestResult[]): string {
  const rows: string[] = [
    '| Profile | Set | Finished | Total (min) | Climbing (min) | Answering (min) | Questions | Accuracy | Sheet visits | Jumps + double jumps | Knock-downs | Crumbles |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const keys = [...new Set(results.map((result) => `${result.profile}|${result.setId}`))];
  for (const key of keys) {
    const [profile, setId] = key.split('|');
    const runs = results.filter((result) => result.profile === profile && result.setId === setId);
    const average = (pick: (climb: SimulatedClimb) => number): number =>
      runs.reduce((sum, run) => sum + pick(run.climb), 0) / runs.length;
    const finished = runs.filter((run) => run.climb.finished).length;
    const accuracy = average((climb) =>
      climb.questionsAnswered === 0 ? 0 : climb.correctAnswers / climb.questionsAnswered,
    );
    rows.push(
      `| ${profile} | ${setId} | ${finished}/${runs.length} | ${minutes(average((c) => c.totalSeconds))} | ${minutes(average((c) => c.climbSeconds))} | ${minutes(average((c) => c.answeringSeconds))} | ${average((c) => c.questionsAnswered).toFixed(0)} | ${Math.round(accuracy * 100)}% | ${average((c) => c.sheetVisits).toFixed(0)} | ${average((c) => c.jumps).toFixed(0)} + ${average((c) => c.airJumps).toFixed(0)} | ${average((c) => c.knockdowns).toFixed(1)} | ${average((c) => c.crumbles).toFixed(1)} |`,
    );
  }
  return `${rows.join('\n')}\n`;
}
