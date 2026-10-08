import { createSeededRandom, sampleQuestionSets } from '@teckin/questions';
import { LocalSession } from '@teckin/session';
import { describe, expect, it } from 'vitest';
import { averageMinutes, runPlaytests } from './playtest';

describe('balance', () => {
  it('a skilled player finishes in 8 to 12 simulated minutes at default settings', async () => {
    const results = await runPlaytests({
      setIds: ['maths'],
      createSession: ({ seed, startingEnergy, energyPerCorrectAnswer }) =>
        new LocalSession({
          questionSet: sampleQuestionSets.maths,
          startingEnergy,
          energyPerCorrectAnswer,
          random: createSeededRandom(seed),
        }),
    });
    const skilled = results.filter((result) => result.profile === 'skilled');
    expect(skilled.every((result) => result.climb.finished)).toBe(true);
    const minutes = averageMinutes(results, 'skilled');
    expect(minutes).toBeGreaterThanOrEqual(8);
    expect(minutes).toBeLessThanOrEqual(12);
    // Weaker players take longer: the race rewards answering well.
    expect(averageMinutes(results, 'average')).toBeGreaterThan(minutes);
  }, 60_000);
});
