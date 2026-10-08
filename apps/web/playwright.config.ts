import { defineConfig, devices } from '@playwright/test';
import { e2eDevGameSecret } from './e2e/support/live-game';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
// Lets environments with a preinstalled Chromium (such as the build sandbox) skip the download.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
// The pages find the realtime server on the page's host at port 2567 (see src/lib/join.ts).
const realtimePort = 2567;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  // Chromium runs every project; the iPhone profile emulates Safari's viewport and touch, not WebKit itself.
  projects: [
    { name: 'iphone-portrait', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
    {
      name: 'iphone-landscape',
      use: { ...devices['iPhone SE landscape'], browserName: 'chromium' },
    },
    { name: 'android-portrait', use: { ...devices['Pixel 7'] } },
    { name: 'android-landscape', use: { ...devices['Pixel 7 landscape'] } },
  ],
  webServer: [
    {
      command: `pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter realtime start',
      url: `http://127.0.0.1:${realtimePort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        REALTIME_PORT: String(realtimePort),
        REALTIME_HOST: '127.0.0.1',
        DEV_GAME_SECRET: e2eDevGameSecret,
        REDIS_URL: '',
      },
    },
  ],
});
