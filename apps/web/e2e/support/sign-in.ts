import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Where the E2E web server drops magic links (`AUTH_DEV_MAILBOX_DIR`). */
export const e2eMailboxDirectory = path.join(tmpdir(), 'teckin-e2e-mailbox');

/**
 * The origin sign-in tests use. Next.js reports 127.0.0.1 as "localhost" inside route handlers,
 * so Auth.js only accepts return addresses on localhost; the whole sign-in flow stays there.
 */
export const e2eSignInOrigin = `http://localhost:${Number(process.env.E2E_PORT ?? 3100)}`;

/** A placeholder signing secret for the E2E server only. */
export const e2eAuthSecret = 'e2e-only-auth-secret-not-used-anywhere-else-0123456789';

/** True when the E2E web server has a database, so sign-in tests can run. */
export const databaseAvailable = Boolean(process.env.DATABASE_URL);

/** A fresh host address for one test. */
export function uniqueHostEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** The mailbox file of an address; same naming as src/auth/magic-link.ts devMailboxFileName. */
function mailboxFile(email: string): string {
  return path.join(
    e2eMailboxDirectory,
    `${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}.json`,
  );
}

/** Waits for the magic link the server sent to `email` and returns it. */
export async function readMagicLink(email: string, timeoutMs = 10_000): Promise<string> {
  const file = mailboxFile(email);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return (JSON.parse(await readFile(file, 'utf8')) as { url: string }).url;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/**
 * Signs up a new host by magic link in `page` and leaves it on the dashboard. Callers use
 * {@link e2eSignInOrigin} as their base URL, as the sign-in tests do.
 */
export async function signUpHost(page: Page, label: string): Promise<string> {
  const email = uniqueHostEmail(label);
  await signInHost(page, email);
  return email;
}

/**
 * Signs `email` in by magic link in `page` (creating the account the first time) and leaves it
 * on the dashboard. `page` must use {@link e2eSignInOrigin} as its base URL.
 */
export async function signInHost(page: Page, email: string): Promise<void> {
  // A link from an earlier sign-in has been used; wait for the new one.
  await rm(mailboxFile(email), { force: true });
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page).toHaveURL(/\/sign-in\/check-email/);
  await page.goto(await readMagicLink(email));
  await expect(page).toHaveURL(/\/dashboard$/);
}
