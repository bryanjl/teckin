import { describe, expect, it } from 'vitest';
import { defaultEmailFrom, readAuthEnvironment, signInMethods } from './auth-environment';

describe('readAuthEnvironment', () => {
  it('offers only logged magic links in development with nothing configured', () => {
    const environment = readAuthEnvironment({ NODE_ENV: 'development' });
    expect(environment.magicLinks).toEqual({ kind: 'log', mailboxDirectory: null });
    expect(signInMethods(environment)).toEqual({ email: true, google: false, microsoft: false });
  });

  it('hides email sign-in in production without an email server', () => {
    const environment = readAuthEnvironment({ NODE_ENV: 'production' });
    expect(signInMethods(environment)).toEqual({ email: false, google: false, microsoft: false });
  });

  it('logs links in a production build only when told to', () => {
    const environment = readAuthEnvironment({
      NODE_ENV: 'production',
      AUTH_LOG_MAGIC_LINKS: 'true',
      AUTH_DEV_MAILBOX_DIR: '/tmp/mailbox',
    });
    expect(environment.magicLinks).toEqual({ kind: 'log', mailboxDirectory: '/tmp/mailbox' });
  });

  it('prefers SMTP whenever an email server is set', () => {
    const environment = readAuthEnvironment({
      NODE_ENV: 'development',
      EMAIL_SERVER: 'smtp://user:placeholder@smtp.example.test:587',
    });
    expect(environment.magicLinks).toEqual({
      kind: 'smtp',
      server: 'smtp://user:placeholder@smtp.example.test:587',
      from: defaultEmailFrom,
    });
  });

  it('enables an OAuth provider only when both its id and secret are set', () => {
    expect(readAuthEnvironment({ AUTH_GOOGLE_ID: 'id' }).google).toBeNull();
    expect(
      readAuthEnvironment({ AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: ' ' }).google,
    ).toBeNull();
    const environment = readAuthEnvironment({
      AUTH_GOOGLE_ID: 'google-id',
      AUTH_GOOGLE_SECRET: 'google-secret',
      AUTH_MICROSOFT_ENTRA_ID_ID: 'entra-id',
      AUTH_MICROSOFT_ENTRA_ID_SECRET: 'entra-secret',
    });
    expect(environment.google).toEqual({ clientId: 'google-id', clientSecret: 'google-secret' });
    expect(environment.microsoft).toEqual({
      clientId: 'entra-id',
      clientSecret: 'entra-secret',
      issuer: null,
    });
    expect(signInMethods(environment)).toMatchObject({ google: true, microsoft: true });
  });
});
