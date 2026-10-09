import { randomUUID } from 'node:crypto';
import { Client } from '@colyseus/sdk';
import { expect, test } from '@playwright/test';
import { NetworkBot } from '@teckin/climber/network-bot';
import { createDatabaseClient, type PrismaClient } from '@teckin/db/client';
import type { QuestionSnapshot } from '@teckin/db';
import { lookupJoinCode } from '../src/lib/join';
import { writeMultipleChoice, writeTrueFalse } from './support/editor';
import { launchClimberGame } from './support/live-game';
import {
  databaseAvailable,
  e2eSignInOrigin,
  readMagicLink,
  uniqueHostEmail,
} from './support/sign-in';

/** The E2E realtime server (see playwright.config.ts). */
const realtimeUrl = 'http://127.0.0.1:2567';

/** How each simulated player answers: the nth question it is asked, right or wrong. */
type AnswerHabit = (answerNumber: number) => boolean;

/** A simulated player and what it has answered, as counted on its side of the connection. */
interface SimulatedPlayer {
  nickname: string;
  bot: NetworkBot;
  answered: number;
  correct: number;
  stopped: boolean;
  loop?: Promise<void>;
}

/**
 * The Phase 4 journey from the outside: a new host signs up from the landing page, writes a
 * question set in the editor, launches a Climber game with their own settings, three simulated
 * players (real WebSocket clients climbing and answering exactly as phones do) join with the
 * code and play, the host ends the game, and the report shows what the players did.
 */
test.describe('sign-up to report', () => {
  test.use({ baseURL: e2eSignInOrigin });
  test.skip(!databaseAvailable, 'Needs DATABASE_URL (a migrated Postgres) for the web server.');
  test.skip(
    () => test.info().project.name !== 'iphone-portrait',
    'One whole journey is enough; it drives its own players',
  );
  test.setTimeout(180_000);

  let database: PrismaClient | undefined;
  const players: SimulatedPlayer[] = [];
  test.afterAll(async () => {
    for (const player of players) player.stopped = true;
    await Promise.all(players.map((player) => player.loop));
    await Promise.all(players.map((player) => player.bot.leave().catch(() => undefined)));
    await database?.$disconnect();
  });

  test('a new host signs up, writes questions, runs a game with 3 players and reads the report', async ({
    page,
  }) => {
    // Sign up from the landing page with an email link.
    await page.goto('/');
    await page.getByTestId('sign-up-link').click();
    await expect(page.getByRole('heading', { name: 'Create your host account' })).toBeVisible();
    const email = uniqueHostEmail('journey');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page).toHaveURL(/\/sign-in\/check-email/);
    await page.goto(await readMagicLink(email));
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('no-question-sets')).toBeVisible();

    // Write a set of five questions in the editor.
    await page.getByRole('link', { name: '+ New set' }).click();
    await page.getByTestId('set-title').fill('Space facts');
    await writeMultipleChoice(
      page,
      'Which planet is closest to the Sun?',
      ['Venus', 'Mercury', 'Mars'],
      1,
    );
    await writeTrueFalse(page, 'The Moon has its own light.', 'False');
    await writeMultipleChoice(
      page,
      'How many planets are in our solar system?',
      ['7', '8', '9', '10'],
      1,
    );
    await writeTrueFalse(page, 'Jupiter is bigger than Earth.', 'True');
    await writeMultipleChoice(page, 'What is the Sun?', ['A star', 'A planet'], 0);
    await page.getByTestId('save-set').click();
    await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

    // Launch a Climber game with this host's own settings.
    const gameSessionId = await launchClimberGame(page, {
      setTitle: 'Space facts',
      checkpoints: true,
    });
    await expect(page.getByText('Checkpoints on')).toBeVisible();
    const code = ((await page.getByTestId('join-code').textContent()) ?? '').replace(/\s/g, '');

    // The right answers, from the question snapshot the game launched with.
    database = createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
      maxConnections: 2,
    });
    const game = await database.gameSession.findUniqueOrThrow({ where: { id: gameSessionId } });
    const snapshot = game.questionSnapshot as unknown as QuestionSnapshot;
    const correctOption = new Map(
      snapshot.questions.map((question) => [
        question.id,
        question.options.find((option) => option.isCorrect)!.id,
      ]),
    );

    // Three players join with the code, as phones do, and answer in their own ways.
    const lookup = await lookupJoinCode(realtimeUrl, code);
    if (!lookup.ok) throw new Error(`Join code ${code} did not resolve: ${lookup.problem}`);
    const client = new Client(realtimeUrl);
    const habits: Record<string, AnswerHabit> = {
      Ann: () => true,
      Bea: (answerNumber) => answerNumber % 2 === 0,
      Cal: (answerNumber) => answerNumber % 3 === 2,
    };
    for (const [nickname, habit] of Object.entries(habits)) {
      const room = await client.joinById(lookup.roomId, {
        role: 'player',
        nickname,
        deviceKey: randomUUID(),
      });
      const player: SimulatedPlayer = {
        nickname,
        bot: undefined as never,
        answered: 0,
        correct: 0,
        stopped: false,
      };
      player.bot = await NetworkBot.start(room, {
        askBelow: 200,
        refillTo: 120,
        chooseAnswer: (questionId, optionIds) => {
          const right = correctOption.get(questionId)!;
          const answerRight = habit(player.answered);
          const choice = answerRight ? right : optionIds.find((id) => id !== right)!;
          player.answered += 1;
          if (choice === right) player.correct += 1;
          return choice;
        },
      });
      players.push(player);
    }
    await expect(page.getByTestId('host-player')).toHaveCount(3);

    // Start, let them climb for a while, then stop them and end the game.
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('host-phase')).toHaveText('Playing', { timeout: 10_000 });
    for (const player of players) {
      player.loop = (async () => {
        while (!player.stopped) {
          await player.bot.play(0.1);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      })();
    }
    await expect
      .poll(() => Math.min(...players.map((player) => player.answered)), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(3_000);
    for (const player of players) player.stopped = true;
    await Promise.all(players.map((player) => player.loop));
    // Answers the bots counted have all been acknowledged by the room (submitAnswer awaits it).
    await page.getByTestId('end-button').click();
    await page.getByTestId('end-confirm-button').click();
    await expect(page.getByTestId('host-results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(3);

    // The report, reached the way a host would: dashboard, Past games, the game.
    await page.goto('/dashboard');
    await page.getByTestId('past-games-link').click();
    await expect(page.getByTestId('past-game')).toHaveCount(1);
    await expect(page.getByTestId('past-game')).toContainText('Space facts');
    await page.getByTestId('past-game').click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/games/${gameSessionId}$`));
    await expect(page.getByTestId('report-title')).toContainText('Space facts');

    // Answers are written in batches; the report settles once the last batch lands.
    const totalAnswered = players.reduce((sum, player) => sum + player.answered, 0);
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId('report-summary')).toContainText(String(totalAnswered), {
        timeout: 1_000,
      });
    }).toPass({ timeout: 15_000 });

    await expect(page.getByTestId('report-player')).toHaveCount(3);
    for (const player of players) {
      const row = page.getByTestId('report-player').filter({ hasText: player.nickname });
      await expect(row.getByTestId('report-player-answers')).toContainText(
        `${player.correct} of ${player.answered} correct`,
      );
      await expect(row.getByTestId('report-player-accuracy')).toHaveText(
        `${Math.round((player.correct / player.answered) * 100)}%`,
      );
      // Every player finished with a rank.
      await expect(row).toContainText(/^\s*[1-3]\./);
    }
    expect(players.find((player) => player.nickname === 'Ann')!.correct).toBe(
      players.find((player) => player.nickname === 'Ann')!.answered,
    );
    // Every question the players saw is in the per-question table, hardest first.
    const questionRows = page.getByTestId('report-question');
    await expect(questionRows.first()).toBeVisible();
    const accuracies = (await page.getByTestId('report-question-accuracy').allTextContents())
      .filter((text) => text.endsWith('%'))
      .map((text) => Number(text.replace('%', '')));
    expect(accuracies).toEqual([...accuracies].sort((a, b) => a - b));
  });
});
