import { expect, test } from '@playwright/test';
import { createPlayableSet, launchClimberGame } from './support/live-game';
import { databaseAvailable, e2eSignInOrigin, signUpHost } from './support/sign-in';

test.describe('new game', () => {
  test.use({ baseURL: e2eSignInOrigin });
  test.skip(!databaseAvailable, 'Needs DATABASE_URL (a migrated Postgres) for the web server.');
  test.beforeEach(({ browserName: _browserName }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith('portrait'),
      'The dashboard runs on the portrait phone profiles here.',
    );
  });

  test('lists the registered games with settings from their schema, and launches one', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUpHost(page, 'new-game');
    await page.goto('/dashboard/new-game');
    await expect(page.getByTestId('no-playable-sets')).toBeVisible();

    await createPlayableSet(page, 'Evens');
    await page.goto('/dashboard/new-game');
    await expect(page.getByTestId('game-choice-climber')).toBeChecked();
    await expect(page.getByTestId('game-setting-energyPerCorrectAnswer')).toHaveValue('100');
    await expect(page.getByTestId('game-setting-checkpointsEnabled')).not.toBeChecked();
    await expect(page.getByTestId('room-setting-durationMinutes')).toHaveValue('15');
    await expect(page.getByLabel('Energy per correct answer')).toBeVisible();
    // The launch button stays reachable at the bottom of a phone screen.
    await expect(page.getByTestId('launch-button')).toBeInViewport();

    const gameSessionId = await launchClimberGame(page, { setTitle: 'Evens', checkpoints: true });
    await expect(page.getByTestId('host-phase')).toHaveText('Lobby');
    await expect(page.getByText('Checkpoints on')).toBeVisible();

    // The dashboard lists the game with a way back to its host screen.
    await page.goto('/dashboard');
    const link = page.getByTestId('recent-game-host-link');
    await expect(link).toHaveAttribute('href', `/host/${gameSessionId}`);
    await link.click();
    await expect(page.getByTestId('host-phase')).toHaveText('Lobby');
  });
});
