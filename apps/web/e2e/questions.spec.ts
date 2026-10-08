import { expect, test, type Page } from '@playwright/test';

async function openGame(page: Page, query = '?debug=1'): Promise<void> {
  await page.goto(`/play/solo${query}`);
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running', {
    timeout: 20_000,
  });
  await expect.poll(() => page.evaluate(() => window.__teckinGame?.player().onGround)).toBe(true);
}

const energy = (page: Page) => page.evaluate(() => window.__teckinGame?.energy() ?? -1);

async function currentQuestionId(page: Page): Promise<string> {
  const section = page.getByTestId('question-sheet').locator('[data-question-id]');
  await expect(section).not.toHaveAttribute('data-question-id', '');
  return (await section.getAttribute('data-question-id')) ?? '';
}

async function correctOption(page: Page, questionId: string): Promise<string> {
  const option = await page.evaluate((id) => window.__teckinGame?.correctOptionFor(id), questionId);
  if (!option) throw new Error('debug oracle missing');
  return option;
}

test('Get energy opens the sheet and a correct answer adds energy', async ({ page }) => {
  await openGame(page);
  expect(await energy(page)).toBe(50);
  await page.getByTestId('get-energy-button').tap();
  await expect(page.getByTestId('question-sheet')).toBeVisible();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'answering');
  const id = await currentQuestionId(page);
  await page.locator(`[data-option-id="${await correctOption(page, id)}"]`).tap();
  await expect(page.getByTestId('answer-feedback')).toHaveText('Correct! +100 Energy');
  expect(await energy(page)).toBe(150);
  await expect(page.getByTestId('energy-value')).toHaveText('Energy 150');
  await page.getByTestId('close-sheet').tap();
  await expect(page.getByTestId('question-sheet')).toBeHidden();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running');
});

test('a wrong answer adds nothing and shows the right answer for 2 seconds', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('get-energy-button').tap();
  const id = await currentQuestionId(page);
  const correct = await correctOption(page, id);
  // Time the reveal inside the page, so slow test machines do not skew it.
  const revealMs = page.evaluate(
    (questionId) =>
      new Promise<number>((resolve) => {
        let shownAt = 0;
        const timer = setInterval(() => {
          const feedback =
            document.querySelector('[data-testid="answer-feedback"]')?.textContent ?? '';
          const current = document
            .querySelector('[data-question-id]')
            ?.getAttribute('data-question-id');
          if (!shownAt && feedback.startsWith('Not quite')) shownAt = performance.now();
          if (shownAt && current !== questionId) {
            clearInterval(timer);
            resolve(performance.now() - shownAt);
          }
        }, 20);
      }),
    id,
  );
  const wrong = page
    .locator(`[data-testid="answer-option"]:not([data-option-id="${correct}"])`)
    .first();
  await wrong.tap();
  await expect(page.getByTestId('answer-feedback')).toHaveText(/^Not quite\. The answer is /);
  await expect(page.locator(`[data-option-id="${correct}"]`)).toBeDisabled();
  expect(await energy(page)).toBe(50);
  const shownFor = await revealMs;
  expect(shownFor).toBeGreaterThanOrEqual(1_900);
  expect(shownFor).toBeLessThan(3_000);
});

test('the game cannot move while the sheet is open and resumes exactly where it was', async ({
  page,
}) => {
  await openGame(page);
  // Start a jump, then open the sheet mid-air: the hardest moment to freeze.
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__teckinGame?.player().onGround)).toBe(false);
  await page.keyboard.up('ArrowRight');
  await page.getByTestId('get-energy-button').tap();
  await expect(page.getByTestId('question-sheet')).toBeVisible();
  const frozen = await page.evaluate(() => ({
    player: window.__teckinGame?.player(),
    time: window.__teckinGame?.course().elapsedSeconds,
  }));
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowLeft');
  const during = await page.evaluate(() => ({
    player: window.__teckinGame?.player(),
    time: window.__teckinGame?.course().elapsedSeconds,
  }));
  expect(during.player).toEqual(frozen.player);
  // The game clock keeps running while answering: a wrong answer costs time.
  expect(during.time ?? 0).toBeGreaterThan((frozen.time ?? 0) + 0.2);

  // Close the sheet and read the player in the same task, before any frame can run.
  const resumed = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[data-testid="close-sheet"]')?.click();
    return window.__teckinGame?.player();
  });
  expect(resumed).toEqual(frozen.player);
  await expect(page.getByTestId('question-sheet')).toBeHidden();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running');
  // Keys pressed while the sheet was open never reach the game.
  expect(await page.evaluate(() => window.__teckinGame?.heldActions())).toEqual([]);
});

test('the question sheet works one-handed on a phone held upright', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('landscape'), 'portrait layout check');
  await openGame(page);
  await page.getByTestId('get-energy-button').tap();
  await currentQuestionId(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const sheetBox = await page.getByTestId('question-sheet').locator('section').boundingBox();
  expect(sheetBox?.height ?? 0).toBeGreaterThanOrEqual(viewport.height * 0.55);
  const buttons = page.getByTestId('answer-option');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < count; index += 1) {
    const box = await buttons.nth(index).boundingBox();
    if (!box) throw new Error('answer button hidden');
    // In the lower part of the screen, inside it, wide and tall enough for a thumb.
    expect(box.y).toBeGreaterThanOrEqual(viewport.height * 0.4);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.height).toBeGreaterThanOrEqual(56);
    expect(box.width).toBeGreaterThanOrEqual(viewport.width * 0.8);
  }
  const close = await page.getByTestId('close-sheet').boundingBox();
  expect(close?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
});

test('the Get energy button pulses when energy is low', async ({ page }) => {
  await openGame(page);
  const button = page.getByTestId('get-energy-button');
  await expect(button).toHaveAttribute('data-low', 'false');
  // Jumps spend energy; keep jumping until the meter is low.
  for (let attempt = 0; attempt < 10 && (await energy(page)) >= 20; attempt += 1) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(900);
  }
  expect(await energy(page)).toBeLessThan(20);
  await expect(button).toHaveAttribute('data-low', 'true');
});

test('muting is remembered after a reload', async ({ page }) => {
  await openGame(page);
  const mute = page.getByTestId('mute-button');
  await expect(mute).toHaveAttribute('data-muted', 'false');
  await mute.tap();
  await expect(mute).toHaveAttribute('data-muted', 'true');
  await openGame(page);
  await expect(page.getByTestId('mute-button')).toHaveAttribute('data-muted', 'true');
});

test('?set= picks the question set', async ({ page }) => {
  await openGame(page, '?debug=1&set=spelling');
  await page.getByTestId('get-energy-button').tap();
  expect(await currentQuestionId(page)).toMatch(/^spelling-/);
});

test('reduced motion swaps the flying energy for a simple fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await page.getByTestId('get-energy-button').tap();
  const id = await currentQuestionId(page);
  // The "+100" lives under a second; watch for it in the page so a slow tap cannot miss it.
  const motion = page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const observer = new MutationObserver(() => {
          const gain = document.querySelector('[data-testid="energy-gain"]');
          if (gain) {
            observer.disconnect();
            resolve(gain.getAttribute('data-motion'));
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }),
  );
  await page.locator(`[data-option-id="${await correctOption(page, id)}"]`).tap();
  expect(await motion).toBe('reduced');
});

test('?tune=1 changes jump cost and energy per answer while playing', async ({ page }) => {
  await openGame(page, '?debug=1&tune=1');
  await page.getByTestId('tuning-toggle').tap();
  await expect(page.getByTestId('tuning-panel')).toBeVisible();
  await page.getByTestId('tune-jump-cost').fill('5');
  await expect(page.getByTestId('tune-value-jump-cost')).toHaveText('5');
  await page.getByTestId('tune-energy-per-answer').fill('300');
  await page.getByTestId('tuning-toggle').tap();

  await page.keyboard.press('Space');
  await expect.poll(() => energy(page)).toBe(45);
  await expect
    .poll(() => page.evaluate(() => window.__teckinGame?.player().onGround), { timeout: 4_000 })
    .toBe(true);
  const before = await energy(page);
  await page.getByTestId('get-energy-button').tap();
  const id = await currentQuestionId(page);
  await page.locator(`[data-option-id="${await correctOption(page, id)}"]`).tap();
  await expect.poll(() => energy(page)).toBe(before + 300);
});
