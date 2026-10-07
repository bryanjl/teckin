import { expect, test } from '@playwright/test';

test('home page links to the solo climb', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Teckin' })).toBeVisible();
  await page.getByRole('link', { name: /solo/i }).click();
  await expect(page).toHaveURL(/\/play\/solo$/);
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running');
});

test('home page fits a phone screen without horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
