import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

/** Waits for the magic link the server sent to `email` and returns it. */
export async function readMagicLink(email: string, timeoutMs = 10_000): Promise<string> {
  // Same naming as src/auth/magic-link.ts devMailboxFileName.
  const file = path.join(
    e2eMailboxDirectory,
    `${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}.json`,
  );
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
