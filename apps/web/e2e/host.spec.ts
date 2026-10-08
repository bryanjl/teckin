import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { createPlayableSet, launchClimberGame } from './support/live-game';
import { databaseAvailable, e2eSignInOrigin, signInHost, signUpHost } from './support/sign-in';

/**
 * The host live screen on a laptop, launched by a signed-in host from "New game": code, QR and
 * join link in the lobby; players appearing
 * live; rename, remove (and letting removed players back) and locking; the countdown; the
 * tower view, live leaderboard, timer and added time during play; ending the game; and the
 * final ranking, the same as the phones', surviving a reload and opening on a second screen
 * signed in to the same account. Hosts from another organisation cannot open or control it.
 * It drives several browsers at once, so it runs in one project only.
 */
test.describe('host live screen', () => {
  test.use({ baseURL: e2eSignInOrigin });
  test.skip(!databaseAvailable, 'Needs DATABASE_URL (a migrated Postgres) for the web server.');
  test.skip(() => test.info().project.name !== 'iphone-portrait', 'Drives several devices itself');
  test.setTimeout(150_000);

  const contexts: BrowserContext[] = [];
  // Extra devices keep running (Phaser loops) until closed; free them for the next test.
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.close()));
  });

  /** A new device; phones use the project's address, host screens the sign-in origin. */
  async function newDevice(
    browser: Browser,
    device: 'iPhone SE' | 'Pixel 7' | 'Desktop Chrome',
  ): Promise<Page> {
    const { defaultBrowserType: _ignored, ...profile } = devices[device];
    const context = await browser.newContext({
      ...profile,
      baseURL: device === 'Desktop Chrome' ? e2eSignInOrigin : test.info().project.use.baseURL,
    });
    contexts.push(context);
    return context.newPage();
  }

  async function shot(page: Page, name: string): Promise<void> {
    const folder = process.env.E2E_SHOTS;
    if (folder) await page.screenshot({ path: `${folder}/${name}.png` });
  }

  /** Fills the join form; resolves once the phone is on the play page or shows a problem. */
  async function tryJoin(phone: Page, code: string, nickname: string): Promise<void> {
    await phone.goto(`/join?code=${code}`);
    await phone.getByTestId('nickname-input').fill(nickname);
    await phone.getByTestId('join-button').click();
  }

  function timerSeconds(text: string | null): number {
    const [minutes, seconds] = (text ?? '0:00').trim().split(':').map(Number);
    return minutes! * 60 + seconds!;
  }

  test('runs a game from the lobby to the final ranking', async ({ browser, page: host }) => {
    await host.setViewportSize({ width: 1280, height: 800 });
    const hostEmail = await signUpHost(host, 'host-screen');
    await createPlayableSet(host, 'Even numbers');
    const gameSessionId = await launchClimberGame(host, {
      setTitle: 'Even numbers',
      checkpoints: true,
    });

    // Another organisation's host can neither open the host screen nor see the game.
    const intruder = await newDevice(browser, 'Desktop Chrome');
    await signUpHost(intruder, 'intruder');
    const intruderVisit = await intruder.goto(`/host/${gameSessionId}`);
    expect(intruderVisit?.status()).toBe(404);
    await intruder.goto('/dashboard');
    await expect(intruder.getByTestId('no-recent-games')).toBeVisible();
    // Signed-out visitors are sent to sign in.
    const visitor = await newDevice(browser, 'Desktop Chrome');
    await visitor.goto(`/host/${gameSessionId}`);
    await expect(visitor).toHaveURL(/\/sign-in/);

    // Lobby: the code in big digits, the join link and a QR code of the join link.
    await expect(host.getByTestId('host-phase')).toHaveText('Lobby');
    const shownCode = (await host.getByTestId('join-code').textContent()) ?? '';
    expect(shownCode).toMatch(/^[1-9]\d{2} \d{3}$/);
    const code = shownCode.replace(' ', '');
    const origin = new URL(host.url()).origin;
    await expect(host.getByTestId('join-qr')).toHaveAttribute(
      'data-qr-text',
      `${origin}/join?code=${code}`,
    );
    await expect(host.getByTestId('join-link')).toHaveText(`${new URL(origin).host}/join`);
    await expect(host.getByText('Checkpoints on')).toBeVisible();
    await expect(host.getByTestId('host-no-players')).toBeVisible();
    await expect(host.getByTestId('start-button')).toBeDisabled();

    // Players appear live as they join.
    const ada = await newDevice(browser, 'iPhone SE');
    await tryJoin(ada, code, 'Ada');
    await expect(ada).toHaveURL(new RegExp(`/play/${code}$`));
    const bo = await newDevice(browser, 'Pixel 7');
    await tryJoin(bo, code, 'Bo');
    await expect(bo).toHaveURL(new RegExp(`/play/${code}$`));
    await expect(host.getByTestId('host-player')).toHaveCount(2);
    await expect(host.getByTestId('host-player-count')).toHaveText('2 players');

    // Rename: the filter speaks first, then the phone shows its new name.
    const boRow = host.getByTestId('host-player').filter({ hasText: 'Bo' });
    await boRow.getByTestId('rename-button').click();
    await boRow.getByTestId('rename-input').fill('Sh1t');
    await boRow.getByTestId('rename-save').click();
    await expect(boRow.getByRole('alert')).toBeVisible();
    await boRow.getByTestId('rename-input').fill('Bob');
    await boRow.getByTestId('rename-save').click();
    await expect(bo.getByTestId('lobby-nickname')).toHaveText('Bob');
    // Renaming to a name already taken is refused by the room and explained.
    const bobRow = host.getByTestId('host-player').filter({ hasText: 'Bob' });
    await bobRow.getByTestId('rename-button').click();
    await bobRow.getByTestId('rename-input').fill('ada');
    await bobRow.getByTestId('rename-save').click();
    await expect(host.getByTestId('host-notice')).toContainText('already has that name');

    // Lock: a new player is refused until the host unlocks.
    await host.getByTestId('lock-button').click();
    await expect(host.getByTestId('locked-badge')).toBeVisible();
    const cy = await newDevice(browser, 'Pixel 7');
    await tryJoin(cy, code, 'Cy');
    await expect(cy.getByTestId('join-problem')).toContainText('locked');
    await host.getByTestId('lock-button').click();
    await expect(host.getByTestId('locked-badge')).toBeHidden();

    // Remove: the phone is told, cannot come back (even with another name) until allowed.
    await bobRow.getByTestId('remove-button').click();
    await bobRow.getByTestId('remove-confirm').click();
    await expect(bo.getByText('The host removed you from this game.')).toBeVisible();
    await expect(host.getByTestId('host-player')).toHaveCount(1);
    await tryJoin(bo, code, 'Bobby');
    await expect(bo.getByTestId('join-problem')).toContainText('removed you');
    await host.getByTestId('allow-removed-button').click();
    await tryJoin(bo, code, 'Bobby');
    await expect(bo).toHaveURL(new RegExp(`/play/${code}$`));
    await expect(host.getByTestId('host-player')).toHaveCount(2);
    await shot(host, 'host-lobby');

    // Ada's phone climbs on its own once the game starts.
    await ada.goto(`/play/${code}?debug=1&autopilot=1`);
    await expect(ada.getByTestId('game-root')).toHaveAttribute('data-game-status', 'waiting', {
      timeout: 20_000,
    });
    const adaId = await host
      .getByTestId('host-player')
      .filter({ hasText: 'Ada' })
      .getAttribute('data-player-id');

    // Start: the countdown fills the screen, then the tower, leaderboard and timer.
    await host.getByTestId('start-button').click();
    await expect(host.getByTestId('host-countdown')).toBeVisible();
    await expect(host.getByTestId('host-phase')).toHaveText('Playing', { timeout: 10_000 });
    await expect(host.getByTestId('tower-view')).toBeVisible();
    await expect(host.getByTestId('tower-summit')).toHaveCount(6);
    await expect(host.getByTestId('tower-dot')).toHaveCount(2);
    await expect(host.getByTestId('leaderboard-row')).toHaveCount(2);
    await expect(host.getByTestId('leaderboard-marker')).toHaveCount(2);
    await expect(host.getByTestId('join-strip')).toBeVisible();
    await expect
      .poll(
        async () =>
          Number(
            await host
              .locator(`[data-testid="tower-dot"][data-player-id="${adaId}"]`)
              .getAttribute('data-height'),
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await expect(host.getByTestId('leaderboard-row').first()).toHaveAttribute(
      'data-player-id',
      adaId!,
    );

    // Adding a minute moves the clock on by a minute.
    const before = timerSeconds(await host.getByTestId('host-timer').textContent());
    expect(before).toBeGreaterThan(14 * 60);
    await host.getByTestId('add-minute-button').click();
    await expect
      .poll(async () => timerSeconds(await host.getByTestId('host-timer').textContent()))
      .toBeGreaterThan(before + 50);
    await shot(host, 'host-playing');

    // Ending needs a second press; then everyone sees the same ranking.
    await host.getByTestId('end-button').click();
    await expect(host.getByTestId('host-phase')).toHaveText('Playing');
    await host.getByTestId('end-confirm-button').click();
    await expect(host.getByTestId('host-results')).toBeVisible({ timeout: 10_000 });
    await expect(host.getByTestId('host-winner')).toHaveText('Ada wins!');
    const order = (page: Page) =>
      page
        .getByTestId('leaderboard-row')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-player-id')));
    await expect(host.getByTestId('leaderboard-row')).toHaveCount(2);
    const hostOrder = await order(host);
    await expect(ada.getByTestId('results-screen')).toBeVisible({ timeout: 10_000 });
    expect(await order(ada)).toEqual(hostOrder);
    await shot(host, 'host-results');

    // A reload keeps the host in the game (a fresh pass), still on the results.
    await host.reload();
    await expect(host.getByTestId('host-results')).toBeVisible({ timeout: 10_000 });
    expect(await order(host)).toEqual(hostOrder);

    // A second screen signed in to the same account opens the same address.
    const projector = await newDevice(browser, 'Desktop Chrome');
    await signInHost(projector, hostEmail);
    await projector.goto(`/host/${gameSessionId}`);
    await expect(projector.getByTestId('host-results')).toBeVisible({ timeout: 10_000 });
    expect(await order(projector)).toEqual(hostOrder);

    // The realtime server recorded the game, so it has a report with the final ranking.
    await projector.goto(`/dashboard/games/${gameSessionId}`);
    await expect(projector.getByTestId('report-live')).toHaveCount(0);
    await expect(projector.getByTestId('report-player').first()).toContainText('1. Ada');
    await projector.goto('/dashboard/games');
    await expect(projector.getByTestId('past-game')).toHaveCount(1);
  });

  test('answers 404 for a game that does not exist', async ({ page }) => {
    await signUpHost(page, 'no-game');
    const response = await page.goto('/host/not-a-real-game');
    expect(response?.status()).toBe(404);
  });
});
