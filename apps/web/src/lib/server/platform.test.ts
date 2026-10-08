import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '@teckin/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { magicLinkProvider } from '../../auth/magic-link';
import {
  allowSignInEmail,
  allowSignInFromAddress,
  requestAddress,
  signInRateLimits,
} from './platform';

const connectionString = testDatabaseUrl();

describe('requestAddress', () => {
  it('trusts the address the nearest proxy appended', () => {
    const headers = (values: Record<string, string>) => new Headers(values);
    expect(requestAddress(headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
    expect(requestAddress(headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(requestAddress(headers({}))).toBe('unknown');
  });

  it('has sign-in limits that a class sharing one address does not hit', () => {
    expect(signInRateLimits().perAddress.limit).toBeGreaterThanOrEqual(20);
    expect(signInRateLimits().perEmail.limit).toBe(5);
  });
});

(connectionString ? describe : describe.skip)('sign-in rate limits', () => {
  let testDatabase: TestDatabase;
  beforeAll(async () => {
    testDatabase = await createTestDatabase(connectionString!);
  });
  afterAll(async () => {
    await testDatabase.dispose();
  });

  it('refuses a sixth sign-in email to one address within 15 minutes', async () => {
    const { database } = testDatabase;
    const results = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push(await allowSignInEmail('Teacher@School.test', 'form', database));
    }
    expect(results).toEqual([true, true, true, true, true, false]);
    // Case does not buy a fresh allowance; another address has its own.
    expect(await allowSignInEmail('teacher@school.test', 'form', database)).toBe(false);
    expect(await allowSignInEmail('other@school.test', 'form', database)).toBe(true);
  });

  it('refuses sign-ins from one network address past the limit', async () => {
    const { database } = testDatabase;
    const { limit } = signInRateLimits().perAddress;
    for (let attempt = 0; attempt < limit; attempt += 1) {
      expect(await allowSignInFromAddress('203.0.113.50', database)).toBe(true);
    }
    expect(await allowSignInFromAddress('203.0.113.50', database)).toBe(false);
    expect(await allowSignInFromAddress('203.0.113.51', database)).toBe(true);
  });

  it('sends no magic link once an address has had too many', async () => {
    const { database } = testDatabase;
    const sent: string[] = [];
    const provider = magicLinkProvider({ kind: 'log', mailboxDirectory: null }, (email) =>
      allowSignInEmail(email, 'send', database),
    );
    const originalInfo = console.info;
    console.info = (message: string) => sent.push(message);
    try {
      const send = () =>
        provider.sendVerificationRequest({
          identifier: 'flooded@school.test',
          url: 'http://localhost:3000/api/auth/callback/email?token=t',
          expires: new Date(),
          token: 't',
          provider,
          theme: {},
          request: new Request('http://localhost:3000'),
        });
      for (let attempt = 0; attempt < 5; attempt += 1) await send();
      await expect(send()).rejects.toThrow(/Too many/);
    } finally {
      console.info = originalInfo;
    }
    expect(sent).toHaveLength(5);
  });
});
