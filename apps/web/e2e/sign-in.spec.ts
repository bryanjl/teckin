import { personalOrganisationName } from '@teckin/db';
import { expect, test } from '@playwright/test';
import {
  databaseAvailable,
  e2eSignInOrigin,
  readMagicLink,
  uniqueHostEmail,
} from './support/sign-in';

test.describe('host sign-in', () => {
  test.use({ baseURL: e2eSignInOrigin });
  test.skip(!databaseAvailable, 'Needs DATABASE_URL (a migrated Postgres) for the web server.');
  test.beforeEach(({ browserName: _browserName }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith('portrait'),
      'Sign-in runs on the portrait phone profiles only.',
    );
  });

  test('a new host signs up by magic link and gets a personal organisation', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard$/);
    await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /microsoft/i })).toHaveCount(0);

    const email = uniqueHostEmail('new-host');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page).toHaveURL(/\/sign-in\/check-email/);
    await expect(page.getByTestId('magic-link-logged')).toBeVisible();

    const link = await readMagicLink(email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/dashboard$/);
    // "<local part>'s organisation", or "...s' organisation" when the random part ends in s.
    await expect(page.getByTestId('organisation-name')).toHaveText(
      personalOrganisationName({ email, name: null }),
    );
    await expect(page.getByTestId('signed-in-email')).toHaveText(email);
    await expect(page.getByTestId('no-question-sets')).toBeVisible();

    const session = await page.request.get('/api/auth/session');
    const body = (await session.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['expires', 'user']);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in/);

    // A magic link works once.
    await page.goto(link);
    await expect(page.getByTestId('sign-in-problem')).toContainText('expired or was already used');
  });

  test('signing in again reaches the same organisation', async ({ page }) => {
    const email = uniqueHostEmail('returning');
    const organisationName = `${email.split('@')[0]}'s organisation`;
    let previousLink: string | null = null;
    for (let visit = 0; visit < 2; visit += 1) {
      await page.goto('/sign-in');
      await page.getByLabel('Email address').fill(email);
      await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
      await expect(page).toHaveURL(/\/sign-in\/check-email/);
      let link = '';
      // The mailbox keeps the latest link per address; wait until this visit's arrives.
      await expect.poll(async () => (link = await readMagicLink(email))).not.toBe(previousLink);
      previousLink = link;
      await page.goto(link);
      await expect(page.getByTestId('organisation-name')).toHaveText(organisationName);
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/$/);
    }
  });
});
