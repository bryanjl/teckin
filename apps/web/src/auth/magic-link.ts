import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EmailConfig } from 'next-auth/providers';
import type { MagicLinkDelivery } from './auth-environment';

/** The Auth.js provider id for email sign-in; the sign-in form calls `signIn(emailProviderId)`. */
export const emailProviderId = 'email';

/** How long a magic link works. Short, because the email may sit in a shared inbox. */
export const magicLinkLifetimeSeconds = 15 * 60;

/** The file a dev mailbox keeps the latest link for an address in (a hash, not the address). */
export function devMailboxFileName(email: string): string {
  return `${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}.json`;
}

/** The sign-in email's subject, text and HTML. */
export function magicLinkEmail(url: string) {
  const host = new URL(url).host;
  const subject = 'Sign in to Teckin';
  const text = [
    'Use this link to sign in to Teckin:',
    url,
    '',
    `It works once and expires in ${magicLinkLifetimeSeconds / 60} minutes.`,
    `If you did not ask to sign in at ${host}, ignore this email.`,
  ].join('\n');
  const escapedUrl = url.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:16px;color:#0f172a">
<p>Use this button to sign in to Teckin.</p>
<p><a href="${escapedUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#0f766e;color:#ffffff;font-weight:bold;text-decoration:none">Sign in</a></p>
<p style="color:#475569">It works once and expires in ${magicLinkLifetimeSeconds / 60} minutes. If you did not ask to sign in at ${host}, ignore this email.</p>
</body></html>`;
  return { subject, text, html };
}

async function sendBySmtp(
  delivery: Extract<MagicLinkDelivery, { kind: 'smtp' }>,
  to: string,
  url: string,
) {
  // Loaded only when SMTP is configured, so local runs never touch the mail library.
  const { createTransport } = await import('nodemailer');
  const transport = createTransport(delivery.server);
  const { subject, text, html } = magicLinkEmail(url);
  const result = await transport.sendMail({ to, from: delivery.from, subject, text, html });
  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])];
  if (failed.length > 0) throw new Error('The sign-in email could not be sent.');
}

async function logLink(
  delivery: Extract<MagicLinkDelivery, { kind: 'log' }>,
  to: string,
  url: string,
  expires: Date,
) {
  console.info(`\n[auth] Magic link for ${to} (local development only):\n${url}\n`);
  if (delivery.mailboxDirectory) {
    await mkdir(delivery.mailboxDirectory, { recursive: true });
    await writeFile(
      path.join(delivery.mailboxDirectory, devMailboxFileName(to)),
      JSON.stringify({ url, expires: expires.toISOString() }),
    );
  }
}

/**
 * The email sign-in provider. Real deployments send through SMTP (Azure Communication Services
 * offers an SMTP relay); local runs print the link to the server log and, for end-to-end tests,
 * also drop it in a mailbox folder.
 */
export function magicLinkProvider(delivery: MagicLinkDelivery): EmailConfig {
  return {
    id: emailProviderId,
    type: 'email',
    name: 'Email',
    maxAge: magicLinkLifetimeSeconds,
    async sendVerificationRequest({ identifier, url, expires }) {
      if (delivery.kind === 'smtp') {
        await sendBySmtp(delivery, identifier, url);
      } else {
        await logLink(delivery, identifier, url, expires);
      }
    },
  };
}
