import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { e2eDevGameSecret } from './support/live-game';

/**
 * A whole local game across devices: a host creates it on `/dev/new-game`, two phones join
 * on `/join` (one with a random name), see the lobby and countdown, see each other climb,
 * and both get the same final ranking when the host ends the game. It drives several
 * browsers at once, so it runs in one project only.
 */
test.describe('live multiplayer game', () => {
  test.skip(() => test.info().project.name !== 'iphone-portrait', 'Drives several devices itself');
  test.setTimeout(120_000);

  async function newPhone(browser: Browser, device: 'iPhone SE' | 'Pixel 7'): Promise<Page> {
    const { defaultBrowserType: _ignored, ...profile } = devices[device];
    const context = await browser.newContext({
      ...profile,
      baseURL: test.info().project.use.baseURL,
    });
    return context.newPage();
  }

  /** Saves a screenshot when `E2E_SHOTS` names a folder, for reviewing the screens by eye. */
  async function shot(page: Page, name: string): Promise<void> {
    const folder = process.env.E2E_SHOTS;
    if (folder) await page.screenshot({ path: `${folder}/${name}.png` });
  }

  async function status(page: Page): Promise<string | undefined> {
    return (await page.getByTestId('game-root').getAttribute('data-game-status')) ?? undefined;
  }

  test('host creates, phones join with nicknames, play live and share the ending', async ({
    browser,
    page: host,
  }) => {
    // The host makes a game.
    await host.setViewportSize({ width: 1280, height: 800 });
    await host.goto('/dev/new-game');
    await host.getByTestId('dev-secret-input').fill(e2eDevGameSecret);
    await host.getByTestId('dev-create-button').click();
    await expect(host).toHaveURL(/\/host\//);
    const code = ((await host.getByTestId('join-code').textContent()) ?? '').replace(/\s/g, '');
    expect(code).toMatch(/^[1-9]\d{5}$/);

    // A wrong code is explained, then the right one leads to the nickname step.
    const ada = await newPhone(browser, 'iPhone SE');
    await ada.goto('/join');
    await ada.getByTestId('join-code-input').fill(code === '999999' ? '999998' : '999999');
    await ada.getByRole('button', { name: 'Next' }).click();
    await expect(ada.getByTestId('join-problem')).toContainText('could not find');
    await ada.getByTestId('join-code-input').fill(`${code.slice(0, 3)} ${code.slice(3)}`);
    await ada.getByRole('button', { name: 'Next' }).click();

    // The profanity filter speaks before anything is sent; "Random name" gives a safe one.
    await ada.getByTestId('nickname-input').fill('Sh1t Head');
    await ada.getByTestId('join-button').click();
    await expect(ada.getByTestId('join-problem')).toContainText('different nickname');
    await ada.getByTestId('random-name-button').click();
    const adaName = await ada.getByTestId('nickname-input').inputValue();
    expect(adaName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    await ada.getByTestId('join-button').click();
    await expect(ada).toHaveURL(new RegExp(`/play/${code}$`));
    await expect(ada.getByTestId('lobby-nickname')).toHaveText(adaName);

    // A second phone opens the join link; a taken nickname is refused by the room.
    const bo = await newPhone(browser, 'Pixel 7');
    await bo.goto(`/join?code=${code}`);
    await bo.getByTestId('nickname-input').fill(adaName.toUpperCase());
    await bo.getByTestId('join-button').click();
    await expect(bo.getByTestId('join-problem')).toContainText('already has that name');
    await bo.getByTestId('nickname-input').fill('Bo');
    await bo.getByTestId('join-button').click();
    await expect(bo.getByTestId('lobby-count')).toHaveText('1 other player');
    await expect(ada.getByTestId('lobby-count')).toHaveText('1 other player');
    await expect(host.getByTestId('host-players')).toContainText('Bo');

    // Reloading with debug hooks rejoins as the same player (device key) and keeps the lobby.
    for (const phone of [ada, bo]) {
      await phone.goto(`/play/${code}?debug=1`);
      await expect(phone.getByTestId('game-root')).toHaveAttribute('data-game-status', 'waiting', {
        timeout: 20_000,
      });
    }
    await expect(bo.getByTestId('lobby-nickname')).toHaveText('Bo');
    await expect(host.getByTestId('host-player')).toHaveCount(2);

    // Nobody moves before the start: the climb waits for the room.
    const lobbyX = await ada.evaluate(() => window.__teckinGame!.player().x);
    await ada.keyboard.down('ArrowRight');
    await ada.waitForTimeout(400);
    await ada.keyboard.up('ArrowRight');
    expect(await ada.evaluate(() => window.__teckinGame!.player().x)).toBe(lobbyX);
    await shot(ada, 'lobby');

    // Start: a 3-2-1 countdown, then the climb runs, with rank and time in the HUD.
    await host.getByTestId('start-button').click();
    await expect(ada.getByTestId('countdown')).toBeVisible();
    await shot(bo, 'countdown');
    for (const phone of [ada, bo]) {
      await expect.poll(() => status(phone), { timeout: 10_000 }).toBe('running');
      await expect(phone.getByTestId('hud-rank')).toHaveText(/^(1st|2nd) of 2 · \d+:\d\d$/);
    }

    // Each phone draws the other climber; Ada walks and Bo sees her move.
    for (const phone of [ada, bo]) {
      await expect
        .poll(() => phone.evaluate(() => window.__teckinGame!.otherClimbersShown()), {
          timeout: 10_000,
        })
        .toBe(1);
    }
    const startX = await ada.evaluate(() => window.__teckinGame!.player().x);
    await ada.keyboard.down('ArrowRight');
    await expect
      .poll(() => ada.evaluate(() => window.__teckinGame!.player().x), { timeout: 5_000 })
      .toBeGreaterThan(startX + 40);
    await ada.keyboard.up('ArrowRight');
    await shot(bo, 'playing');

    // The host ends the game: both phones show the same ranking, each highlighting itself.
    await host.getByTestId('end-button').click();
    await host.getByTestId('end-confirm-button').click();
    const rankings: string[][] = [];
    for (const [phone, name] of [
      [ada, adaName],
      [bo, 'Bo'],
    ] as const) {
      await expect(phone.getByTestId('results-screen')).toBeVisible({ timeout: 10_000 });
      await expect(phone.getByTestId('game-root')).toHaveAttribute('data-game-status', 'ended');
      const rows = phone.getByTestId('leaderboard-row');
      await expect(rows).toHaveCount(2);
      await expect(phone.locator('[data-testid="leaderboard-row"][data-own="true"]')).toContainText(
        `${name}You`,
      );
      rankings.push(
        (
          await rows.evaluateAll((items) =>
            items.map((item) => item.getAttribute('data-player-id')),
          )
        ).map(String),
      );
      await expect(phone.getByTestId('result-rank')).toHaveText(/^(1st|2nd) of 2$/);
    }
    expect(rankings[0]).toEqual(rankings[1]);
    await shot(ada, 'results');
    await expect(ada.getByRole('button', { name: 'Join another game' })).toBeVisible();
  });
});
