import type { AdapterAccount } from '@auth/core/adapters';
import { expect, it } from 'vitest';
import { createAuthAdapter } from './auth-adapter';
import { describeWithDatabase } from './test-support';

describeWithDatabase('Auth.js adapter', (getDatabase) => {
  it('creates the personal organisation with the user', async () => {
    const database = getDatabase();
    const adapter = createAuthAdapter(database);
    const user = await adapter.createUser!({
      id: 'ignored',
      email: 'new.host@example.test',
      emailVerified: new Date(),
      name: null,
    });
    expect(user.id).not.toBe('ignored');
    const memberships = await database.membership.findMany({ where: { userId: user.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe('owner');
    expect(await adapter.getUserByEmail!('NEW.HOST@example.test')).toMatchObject({ id: user.id });
  });

  it('links accounts, ignoring token fields it does not store', async () => {
    const database = getDatabase();
    const adapter = createAuthAdapter(database);
    const user = await adapter.createUser!({
      id: '',
      email: 'entra@example.test',
      emailVerified: null,
    });
    const account = {
      userId: user.id,
      type: 'oidc',
      provider: 'microsoft-entra-id',
      providerAccountId: 'entra-subject',
      access_token: 'placeholder-token',
      expires_at: 1_900_000_000,
      ext_expires_in: 3599,
    } as AdapterAccount;
    await adapter.linkAccount!(account);
    expect(
      await adapter.getUserByAccount!({
        provider: 'microsoft-entra-id',
        providerAccountId: 'entra-subject',
      }),
    ).toMatchObject({ id: user.id });
    await adapter.unlinkAccount!({
      provider: 'microsoft-entra-id',
      providerAccountId: 'entra-subject',
    });
    expect(
      await adapter.getUserByAccount!({
        provider: 'microsoft-entra-id',
        providerAccountId: 'entra-subject',
      }),
    ).toBeNull();
  });

  it('uses a magic-link token once', async () => {
    const adapter = createAuthAdapter(getDatabase());
    const expires = new Date(Date.now() + 60_000);
    await adapter.createVerificationToken!({
      identifier: 'once@example.test',
      token: 'hashed-token',
      expires,
    });
    expect(
      await adapter.useVerificationToken!({
        identifier: 'once@example.test',
        token: 'hashed-token',
      }),
    ).toMatchObject({ identifier: 'once@example.test', expires });
    expect(
      await adapter.useVerificationToken!({
        identifier: 'once@example.test',
        token: 'hashed-token',
      }),
    ).toBeNull();
  });

  it('creates, reads, extends and deletes sessions', async () => {
    const adapter = createAuthAdapter(getDatabase());
    const user = await adapter.createUser!({
      id: '',
      email: 'session@example.test',
      emailVerified: null,
    });
    const expires = new Date(Date.now() + 3_600_000);
    await adapter.createSession!({ sessionToken: 'session-token', userId: user.id, expires });
    const found = await adapter.getSessionAndUser!('session-token');
    expect(found?.user.id).toBe(user.id);
    expect(found?.session).toEqual({ sessionToken: 'session-token', userId: user.id, expires });

    const later = new Date(expires.getTime() + 60_000);
    expect(
      await adapter.updateSession!({ sessionToken: 'session-token', expires: later }),
    ).toMatchObject({ expires: later });
    expect(await adapter.updateSession!({ sessionToken: 'missing', expires: later })).toBeNull();

    await adapter.deleteSession!('session-token');
    await adapter.deleteSession!('session-token');
    expect(await adapter.getSessionAndUser!('session-token')).toBeNull();
  });
});
