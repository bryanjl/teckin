import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDatabaseClient, type PrismaClient } from '@teckin/db/client';
import { organisationData, type QuestionSnapshot } from '@teckin/db';
import { databaseAvailable, e2eSignInOrigin, signUpHost } from './support/sign-in';

/**
 * Past games, a game's report, its CSV downloads and account deletion. The finished game is
 * written straight into the database (as the realtime recorder would), so the report figures
 * are known exactly; playing a whole game live is covered by the host and multiplayer tests.
 */
test.describe('reports and account deletion', () => {
  test.use({ baseURL: e2eSignInOrigin });
  test.skip(!databaseAvailable, 'Needs DATABASE_URL (a migrated Postgres) for the web server.');
  test.skip(
    () => test.info().project.name !== 'iphone-portrait',
    'Data checks, one phone is enough',
  );

  let database: PrismaClient | undefined;
  /** The database, opened on first use (hooks also run in projects that skip these tests). */
  const db = (): PrismaClient => {
    database ??= createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
      maxConnections: 2,
    });
    return database;
  };
  test.afterAll(async () => {
    await database?.$disconnect();
  });

  /** The signed-in host's organisation data, looked up by their email. */
  async function dataOf(email: string) {
    const membership = await db().membership.findFirstOrThrow({
      where: { user: { email: email.toLowerCase() } },
    });
    return organisationData(db(), membership.organisationId);
  }

  /**
   * A finished game: Ava 2 of 3 correct (rank 1), Ben 1 of 3 (rank 2), Cy 1 of 2 and then
   * removed. Question 2 is the hardest (0 of 3), question 1 the easiest (3 of 3).
   */
  async function seedFinishedGame(email: string) {
    const data = await dataOf(email);
    const set = await data.questionSets.create({
      title: 'Times tables',
      questions: [6, 7, 8].map((table) => ({
        type: 'multipleChoice' as const,
        prompt: `What is ${table} × 3?`,
        options: [
          { text: String(table * 3), isCorrect: true },
          { text: String(table * 3 + 1), isCorrect: false },
        ],
      })),
    });
    const game = await data.gameSessions.create({
      gameType: 'climber',
      questionSetId: set.id,
      settings: {},
      hostUserId: null,
    });
    const [first, second, third] = (game.questionSnapshot as unknown as QuestionSnapshot).questions;
    const ava = await data.participants.add(game.id, { nickname: 'Ava' });
    const ben = await data.participants.add(game.id, { nickname: 'Ben' });
    const cy = await data.participants.add(game.id, { nickname: 'Cy' });
    const answer = (
      participantId: string,
      question: NonNullable<typeof first>,
      correct: boolean,
    ) => ({
      participantId,
      questionId: question.id,
      chosenOptionId: question.options[correct ? 0 : 1]!.id,
      isCorrect: correct,
      millisecondsTaken: 2000,
    });
    await data.answerEvents.record(game.id, [
      answer(ava.id, first!, true),
      answer(ava.id, second!, false),
      answer(ava.id, third!, true),
      answer(ben.id, first!, true),
      answer(ben.id, second!, false),
      answer(ben.id, third!, false),
      answer(cy.id, first!, true),
      answer(cy.id, second!, false),
    ]);
    await data.participants.markRemoved(cy.id);
    await data.results.save(game.id, [
      { participantId: ava.id, rank: 1, gameStats: { bestHeightMetres: 640, summitsReached: 4 } },
      { participantId: ben.id, rank: 2, gameStats: { bestHeightMetres: 210, summitsReached: 1 } },
    ]);
    await data.gameSessions.markEnded(game.id);
    return game.id;
  }

  async function download(page: Page, testId: string): Promise<string> {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId(testId).click();
    const file = await downloadPromise;
    return readFile(await file.path(), 'utf8');
  }

  test('past games open a report whose figures match the answers, with CSV downloads', async ({
    page,
    browser,
  }) => {
    const email = await signUpHost(page, 'reports');
    const gameId = await seedFinishedGame(email);

    await page.goto('/dashboard');
    await page.getByTestId('past-games-link').click();
    await expect(page).toHaveURL(/\/dashboard\/games$/);
    await expect(page.getByTestId('past-game')).toHaveCount(1);
    await expect(page.getByTestId('past-game')).toContainText('Times tables');
    await expect(page.getByTestId('past-game')).toContainText('3 players');
    await page.getByTestId('past-game').click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/games/${gameId}$`));

    await expect(page.getByTestId('report-title')).toContainText('Times tables');
    await expect(page.getByTestId('report-summary')).toContainText('8');
    await expect(page.getByTestId('report-summary')).toContainText('50%');
    const players = page.getByTestId('report-player');
    await expect(players).toHaveCount(3);
    await expect(players.nth(0)).toContainText('1. Ava');
    await expect(players.nth(0).getByTestId('report-player-accuracy')).toHaveText('67%');
    await expect(players.nth(0)).toContainText('2 of 3 correct');
    await expect(players.nth(0)).toContainText('Best height 640 m');
    await expect(players.nth(1)).toContainText('2. Ben');
    await expect(players.nth(1).getByTestId('report-player-accuracy')).toHaveText('33%');
    await expect(players.nth(2)).toContainText('Cy');
    await expect(players.nth(2)).toContainText('removed by host');
    const questions = page.getByTestId('report-question');
    await expect(questions.nth(0)).toContainText('What is 7 × 3?');
    await expect(questions.nth(0).getByTestId('report-question-accuracy')).toHaveText('0%');
    await expect(questions.nth(2)).toContainText('What is 6 × 3?');
    await expect(questions.nth(2).getByTestId('report-question-accuracy')).toHaveText('100%');

    const playersCsv = await download(page, 'download-players');
    expect(playersCsv).toContain('Rank,Nickname,Questions answered,Correct answers,Accuracy (%)');
    expect(playersCsv).toContain('1,Ava,3,2,67,2,640,4,');
    expect(playersCsv).toContain(',Cy,2,1,50,2,,,Yes');
    const questionsCsv = await download(page, 'download-questions');
    expect(questionsCsv.split('\r\n')[1]).toMatch(/^2,What is 7 × 3\?,3,0,0,21,/);

    // Another organisation's host gets nothing: no page, no export, not in their list.
    const outsiderContext = await browser.newContext({ baseURL: e2eSignInOrigin });
    const outsider = await outsiderContext.newPage();
    await signUpHost(outsider, 'reports-outsider');
    const reportPage = await outsider.goto(`/dashboard/games/${gameId}`);
    expect(reportPage?.status()).toBe(404);
    const exportResponse = await outsider.request.get(
      `/dashboard/games/${gameId}/export?part=players`,
    );
    expect(exportResponse.status()).toBe(404);
    await outsider.goto('/dashboard/games');
    await expect(outsider.getByTestId('no-past-games')).toBeVisible();
    await outsiderContext.close();
  });

  test('deleting an account removes its data and signs the host out', async ({ page }) => {
    const email = await signUpHost(page, 'deleting');
    const gameId = await seedFinishedGame(email);
    const organisationId = (await dataOf(email)).organisationId;

    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Account' }).click();
    await page.getByTestId('delete-confirmation').fill('delete me');
    await page.getByTestId('delete-account').click();
    await expect(page.getByTestId('delete-confirmation-error')).toContainText('Type DELETE');

    await page.getByTestId('delete-confirmation').fill('DELETE');
    await page.getByTestId('delete-account').click();
    await expect(page.getByTestId('account-deleted')).toBeVisible();

    expect(await db().user.count({ where: { email: email.toLowerCase() } })).toBe(0);
    expect(await db().organisation.count({ where: { id: organisationId } })).toBe(0);
    expect(await db().gameSession.count({ where: { id: gameId } })).toBe(0);
    expect(await db().answerEvent.count({ where: { organisationId } })).toBe(0);
    expect(await db().participant.count({ where: { organisationId } })).toBe(0);
    expect(await db().questionSet.count({ where: { organisationId } })).toBe(0);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
