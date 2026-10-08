import { expect, type Page } from '@playwright/test';

/** Secret the E2E web and realtime servers share; only ever used by the local test servers. */
export const e2eRealtimeSharedSecret = 'e2e-realtime-shared-secret-0123456789abcdef';

/** A CSV of `count` true/false questions, enough for a set to be ready for a game. */
export function playableSetCsv(count = 5): string {
  const lines = ['Question,Type,Correct answer'];
  for (let index = 1; index <= count; index += 1) {
    lines.push(`Is ${index * 2} an even number?,true false,True`);
  }
  return lines.join('\r\n');
}

/** Creates a question set ready for a game by CSV import, from the dashboard of a signed-in host. */
export async function createPlayableSet(page: Page, title: string): Promise<void> {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Import from CSV' }).click();
  await page.getByTestId('csv-file-input').setInputFiles({
    name: 'set.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(playableSetCsv()),
  });
  await page.getByTestId('csv-import-add').click();
  await page.getByTestId('set-title').fill(title);
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
}

/**
 * Launches a Climber game from "New game" for the signed-in host in `page` and waits for its
 * host screen. Returns the game's id (the last part of the host screen's address).
 */
export async function launchClimberGame(
  page: Page,
  options: { setTitle: string; checkpoints?: boolean },
): Promise<string> {
  await page.goto('/dashboard/new-game');
  await page.getByTestId('set-choice').and(page.getByLabel(options.setTitle)).check();
  if (options.checkpoints) await page.getByTestId('game-setting-checkpointsEnabled').check();
  await page.getByTestId('launch-button').click();
  await expect(page).toHaveURL(/\/host\/[^/#]+$/, { timeout: 15_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}
