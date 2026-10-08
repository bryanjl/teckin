import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { devMailboxFileName, magicLinkEmail, magicLinkProvider } from './magic-link';

describe('magic links', () => {
  let mailbox: string | null = null;
  afterEach(async () => {
    vi.restoreAllMocks();
    if (mailbox) await rm(mailbox, { recursive: true, force: true });
    mailbox = null;
  });

  it('logs the link and drops it in the dev mailbox', async () => {
    mailbox = await mkdtemp(path.join(tmpdir(), 'teckin-mailbox-'));
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const provider = magicLinkProvider({ kind: 'log', mailboxDirectory: mailbox });
    const url = 'http://localhost:3000/api/auth/callback/email?token=abc&email=a%40b.test';
    const expires = new Date('2026-10-09T12:00:00Z');
    await provider.sendVerificationRequest({
      identifier: 'Host@Example.test',
      url,
      expires,
      token: 'abc',
      provider,
      theme: {},
      request: new Request('http://localhost:3000'),
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(url));
    const stored = JSON.parse(
      await readFile(path.join(mailbox, devMailboxFileName('host@example.test')), 'utf8'),
    );
    expect(stored).toEqual({ url, expires: expires.toISOString() });
  });

  it('writes an email that carries the link and escapes it in HTML', () => {
    const email = magicLinkEmail('https://teckin.example.test/api/auth/callback/email?a=1&b="2"');
    expect(email.subject).toBe('Sign in to Teckin');
    expect(email.text).toContain('a=1&b="2"');
    expect(email.html).toContain('a=1&amp;b=&quot;2&quot;');
    expect(email.html).not.toContain('b="2"');
  });
});
