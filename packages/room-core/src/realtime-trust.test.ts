import { describe, expect, it } from 'vitest';
import {
  hostPassLifetimeMs,
  issueHostPass,
  signRequest,
  signedRequestMaxAgeMs,
  verifyHostPass,
  verifySignedRequest,
} from './realtime-trust';

const secret = 'a-shared-secret-for-tests-0123456789';
const otherSecret = 'another-shared-secret-for-tests-0123';
const claims = { roomId: 'room1', organisationId: 'org-a', userId: 'user-a' };
const nowMs = 1_800_000_000_000;

describe('host passes', () => {
  it('round-trips the claims until the pass expires', () => {
    const pass = issueHostPass(secret, claims, nowMs);
    expect(verifyHostPass(secret, pass, nowMs + 1000)).toEqual({
      ...claims,
      expiresAtMs: nowMs + hostPassLifetimeMs,
    });
    expect(verifyHostPass(secret, pass, nowMs + hostPassLifetimeMs)).toBeNull();
  });

  it('refuses a pass signed with another secret or with changed claims', () => {
    const pass = issueHostPass(otherSecret, claims, nowMs);
    expect(verifyHostPass(secret, pass, nowMs)).toBeNull();

    const genuine = issueHostPass(secret, claims, nowMs);
    const [, signature] = genuine.split('.');
    const forgedClaims = Buffer.from(
      JSON.stringify({ ...claims, organisationId: 'org-b', expiresAtMs: nowMs + 60_000 }),
    ).toString('base64url');
    expect(verifyHostPass(secret, `${forgedClaims}.${signature}`, nowMs)).toBeNull();
  });

  it('refuses malformed passes', () => {
    for (const pass of ['', 'abc', 'a.b.c', '.', 'e30.x']) {
      expect(verifyHostPass(secret, pass, nowMs)).toBeNull();
    }
  });

  it('refuses to sign with a short secret', () => {
    expect(() => issueHostPass('short', claims, nowMs)).toThrow(/REALTIME_SHARED_SECRET/);
  });
});

describe('signed requests', () => {
  it('accepts a fresh request for the same purpose only', () => {
    const envelope = signRequest(secret, 'launch', { gameId: 'climber' }, nowMs);
    expect(verifySignedRequest(secret, 'launch', envelope, nowMs + 1000)).toMatchObject({
      gameId: 'climber',
    });
    expect(verifySignedRequest(secret, 'other', envelope, nowMs)).toBeNull();
    expect(verifySignedRequest(otherSecret, 'launch', envelope, nowMs)).toBeNull();
    expect(
      verifySignedRequest(secret, 'launch', envelope, nowMs + signedRequestMaxAgeMs + 1),
    ).toBeNull();
  });

  it('refuses a changed payload', () => {
    const envelope = signRequest(secret, 'launch', { organisationId: 'org-a' }, nowMs);
    const changed = { ...envelope, payload: envelope.payload.replace('org-a', 'org-b') };
    expect(verifySignedRequest(secret, 'launch', changed, nowMs)).toBeNull();
    expect(verifySignedRequest(secret, 'launch', { payload: 1 }, nowMs)).toBeNull();
  });
});
