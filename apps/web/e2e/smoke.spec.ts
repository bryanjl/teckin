import { expect, test } from '@playwright/test';

test('landing page offers sign-up, joining and a solo climb', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Teckin', level: 1 })).toBeVisible();
  await expect(page.getByTestId('sign-up-link')).toHaveAttribute('href', '/sign-in?new=1');
  await expect(page.getByRole('link', { name: 'Join a game' }).first()).toHaveAttribute(
    'href',
    '/join',
  );
  await page.getByRole('link', { name: /solo/i }).click();
  await expect(page).toHaveURL(/\/play\/solo$/);
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running');
});

test('landing page fits a phone screen without horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const [path, heading] of [
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms of use'],
] as const) {
  test(`${path} is reachable from the landing page and marked as placeholder text`, async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: heading.split(' ')[0] })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByTestId('placeholder-notice')).toContainText('PLACEHOLDER');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('player pages carry a strict Content Security Policy and play with no violations', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  for (const path of ['/join', '/play/solo']) {
    const response = await page.goto(path);
    const policy = response?.headers()['content-security-policy'] ?? '';
    expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('unsafe-eval');
  }
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running', {
    timeout: 20_000,
  });
  // Each response has its own nonce.
  const first = (await page.request.get('/join')).headers()['content-security-policy'];
  const second = (await page.request.get('/join')).headers()['content-security-policy'];
  expect(first).not.toEqual(second);
  expect(violations).toEqual([]);
});
