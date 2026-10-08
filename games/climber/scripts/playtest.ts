/**
 * Scripted playtests: plays the whole course headlessly with the bot climber and scripted
 * answering for each player profile and sample set, and prints a Markdown table for
 * `docs/playtests.md`. Run with `pnpm --filter @teckin/climber playtest`.
 */
import { createSeededRandom, sampleQuestionSetIds, sampleQuestionSets } from '@teckin/questions';
import { LocalSession } from '@teckin/session';
import { averageMinutes, playerProfiles, playtestReport, runPlaytests } from '../src/run/playtest';

const results = await runPlaytests({
  setIds: sampleQuestionSetIds,
  createSession: ({ setId, seed, startingEnergy, energyPerCorrectAnswer }) =>
    new LocalSession({
      questionSet: sampleQuestionSets[setId as keyof typeof sampleQuestionSets],
      startingEnergy,
      energyPerCorrectAnswer,
      random: createSeededRandom(seed),
    }),
});
process.stdout.write(playtestReport(results));
for (const profile of playerProfiles) {
  process.stdout.write(
    `\n- ${profile.name}: ${averageMinutes(results, profile.name).toFixed(1)} min on average`,
  );
}
process.stdout.write('\n');
