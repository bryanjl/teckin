import { expect, test, type Page } from '@playwright/test';
import type { ClimberDebugHooks } from '@teckin/climber/client';

type PlayerSnapshot = ReturnType<ClimberDebugHooks['player']>;

async function openGame(page: Page, query = '?debug=1'): Promise<void> {
  await page.goto(`/play/solo${query}`);
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running', {
    timeout: 20_000,
  });
}

async function player(page: Page): Promise<PlayerSnapshot> {
  return page.evaluate(() => {
    const hooks = window.__teckinGame;
    if (!hooks) throw new Error('debug hooks missing');
    return hooks.player();
  });
}

async function waitForLanding(page: Page): Promise<PlayerSnapshot> {
  await expect.poll(async () => (await player(page)).onGround, { timeout: 5_000 }).toBe(true);
  return player(page);
}

async function centreOf(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('the game starts in a mobile viewport with a canvas filling the screen', async ({ page }) => {
  await openGame(page, '');
  const canvas = page.locator('[data-testid="game-root"] canvas');
  await expect(canvas).toBeVisible();
  const viewport = page.viewportSize();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeCloseTo(viewport?.width ?? 0, 0);
  expect(box?.height).toBeCloseTo(viewport?.height ?? 0, 0);
  await expect(page.getByTestId('touch-controls')).toBeVisible();
});

test('holding right and tapping jump at the same time moves and jumps (multi-touch)', async ({
  page,
}) => {
  await openGame(page);
  const start = await waitForLanding(page);
  const right = await centreOf(page, 'touch-moveRight');
  const jump = await centreOf(page, 'touch-jump');

  const cdp = await page.context().newCDPSession(page);
  const rightFinger = { x: right.x, y: right.y, id: 1 };
  const jumpFinger = { x: jump.x, y: jump.y, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [rightFinger] });
  await page.waitForTimeout(150);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [rightFinger, jumpFinger],
  });
  await expect
    .poll(() => page.evaluate(() => window.__teckinGame?.heldActions()))
    .toEqual(['moveRight', 'jump']);
  const airborne = await expect
    .poll(async () => (await player(page)).y, { timeout: 2_000 })
    .toBeLessThan(start.y - 20)
    .then(() => player(page));
  expect(airborne.velocityX).toBeGreaterThan(0);

  // Lift only the jump finger; Chromium ends the points listed in a touchEnd.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [jumpFinger] });
  await expect
    .poll(() => page.evaluate(() => window.__teckinGame?.heldActions()))
    .toEqual(['moveRight']);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [rightFinger] });
  await expect.poll(() => page.evaluate(() => window.__teckinGame?.heldActions())).toEqual([]);
  expect((await player(page)).x).toBeGreaterThan(start.x + 20);
});

test('keyboard arrows and space drive the same actions', async ({ page }) => {
  await openGame(page);
  const start = await waitForLanding(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await player(page)).x).toBeGreaterThan(start.x + 20);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await player(page)).jumpsUsed).toBeGreaterThan(0);
});

test('hiding and showing the tab pauses and resumes cleanly', async ({ page }) => {
  await openGame(page);
  await waitForLanding(page);
  const right = await centreOf(page, 'touch-moveRight');
  await page.touchscreen.tap(right.x, right.y);

  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((next) => {
      Object.defineProperty(document, 'visibilityState', { value: next, configurable: true });
      Object.defineProperty(document, 'hidden', { value: next === 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  // Jump so the player is mid-air when the tab hides: the hardest case to resume cleanly.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await player(page)).onGround).toBe(false);
  await setVisibility('hidden');
  const root = page.getByTestId('game-root');
  await expect(root).toHaveAttribute('data-game-status', 'paused');
  const frozen = await player(page);
  await page.waitForTimeout(600);
  expect(await player(page)).toEqual(frozen);

  await setVisibility('visible');
  await expect(root).toHaveAttribute('data-game-status', 'running');
  const resumed = await player(page);
  // A few frames of movement at most. Stepping physics by the 600 ms spent hidden would
  // move the player hundreds of pixels in one go.
  expect(Math.abs(resumed.y - frozen.y)).toBeLessThan(80);
  await waitForLanding(page);
  await expect(page.getByTestId('pause-panel')).toBeHidden();
});

test('the pause button pauses until resume is pressed', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('pause-button').tap();
  await expect(page.getByTestId('pause-panel')).toBeVisible();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'paused');
  await page.getByTestId('resume-button').tap();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running');
});

test('the play surface blocks scroll, zoom, selection and pull-to-refresh', async ({ page }) => {
  await openGame(page);
  const surface = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const root = getComputedStyle(document.documentElement);
    return {
      bodyTouchAction: body.touchAction,
      rootOverscroll: root.overscrollBehaviorY,
      bodyUserSelect: body.userSelect,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
    };
  });
  expect(surface.bodyTouchAction).toBe('none');
  expect(surface.rootOverscroll).toBe('none');
  expect(surface.bodyUserSelect).toBe('none');
  expect(surface.overflowX).toBeLessThanOrEqual(0);
  expect(surface.overflowY).toBeLessThanOrEqual(0);

  // A swipe down over the game must not scroll or refresh the page.
  await page.mouse.wheel(0, 600);
  const centre = page.viewportSize();
  const cdp = await page.context().newCDPSession(page);
  const x = (centre?.width ?? 300) / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 120 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 420 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-game-status', 'running');
});

test('touch controls sit inside the safe-area insets and are at least 72 px', async ({ page }) => {
  await openGame(page);
  const cdp = await page.context().newCDPSession(page);
  const insets = { top: 47, bottom: 34, left: 44, right: 44 };
  let emulated = true;
  try {
    await cdp.send(
      'Emulation.setSafeAreaInsetsOverride' as 'Emulation.setDeviceMetricsOverride',
      {
        insets,
      } as never,
    );
  } catch {
    emulated = false;
  }
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  for (const testId of ['touch-moveLeft', 'touch-moveRight', 'touch-jump']) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, testId).not.toBeNull();
    if (!box) continue;
    expect(box.width).toBeGreaterThanOrEqual(72);
    expect(box.height).toBeGreaterThanOrEqual(72);
    if (emulated) {
      expect(box.y + box.height, testId).toBeLessThanOrEqual(viewport.height - insets.bottom);
      expect(box.x, testId).toBeGreaterThanOrEqual(testId === 'touch-jump' ? 0 : insets.left);
      expect(box.x + box.width, testId).toBeLessThanOrEqual(viewport.width - insets.right);
    }
  }
  const pauseBox = await page.getByTestId('pause-button').boundingBox();
  if (emulated && pauseBox) expect(pauseBox.y).toBeGreaterThanOrEqual(insets.top);
  test.info().annotations.push({
    type: 'safe-area',
    description: emulated ? 'insets emulated via CDP' : 'CDP inset emulation unavailable',
  });
});

test('the theme atlas loads at a texture scale matching the screen density', async ({ page }) => {
  await openGame(page);
  const theme = await page.evaluate(() => window.__teckinGame?.theme());
  expect(theme).toMatchObject({ id: 'placeholder', loaded: true });
  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  // Render resolution is capped at 2x, and the world nearly fills a phone's width.
  expect(theme?.textureScale).toBe(devicePixelRatio >= 2 ? 2 : 1);
  await expect(page.getByTestId('touch-jump').locator('svg')).toBeVisible();
});

test('an unknown theme falls back to the default theme instead of failing', async ({ page }) => {
  await openGame(page, '?debug=1&theme=does-not-exist');
  const theme = await page.evaluate(() => window.__teckinGame?.theme());
  expect(theme).toMatchObject({ id: 'placeholder', loaded: true });
});
