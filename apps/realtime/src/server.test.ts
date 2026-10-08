import { randomUUID } from 'node:crypto';
import type { ColyseusTestServer } from '@colyseus/testing';
import { roomSettingsSchema } from '@teckin/game-contracts';
import { sampleQuestionSets } from '@teckin/questions';
import { issueHostPass } from '@teckin/room-core/realtime-trust';
import { bootTestServer } from '@teckin/room-core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter';
import { clientAddress, createRealtimeServer } from './server';
import { launchTestGame, launchTestGameOrThrow, testLaunchOrganisationId } from './test-launch';

const sharedSecret = 'realtime-shared-secret-for-tests-0123456789';

function hostOptions(roomId: string, organisationId = testLaunchOrganisationId) {
  return {
    role: 'host' as const,
    hostPass: issueHostPass(sharedSecret, { roomId, organisationId, userId: 'host-user' }),
  };
}

describe('realtime server', () => {
  const { gameServer } = createRealtimeServer({ sharedSecret, joinLookupsPerMinute: 5 });
  let colyseus: ColyseusTestServer;
  let baseUrl = '';

  beforeAll(async () => {
    ({ colyseus, baseUrl } = await bootTestServer(gameServer));
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it('reports healthy', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('refuses launches not signed with the shared secret', async () => {
    const forged = await launchTestGame(baseUrl, 'not-the-shared-secret-0123456789abcdef');
    expect(forged.status).toBe(403);
    const unsigned = await fetch(`${baseUrl}/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'climber' }),
    });
    expect(unsigned.status).toBe(403);
  });

  it('refuses unknown games and settings outside the game schema', async () => {
    expect((await launchTestGame(baseUrl, sharedSecret, { gameId: 'chess' })).status).toBe(400);
    const badSettings = await launchTestGame(baseUrl, sharedSecret, {
      gameSettings: { energyPerCorrectAnswer: 1 },
    });
    expect(badSettings.status).toBe(400);
  });

  it('refuses to start with a shared secret too short to be safe', () => {
    expect(() => createRealtimeServer({ sharedSecret: 'short' })).toThrow(/REALTIME_SHARED_SECRET/);
  });

  it('refuses nicknames the profanity filter catches', async () => {
    const launched = await launchTestGameOrThrow(baseUrl, sharedSecret);
    await expect(
      colyseus.sdk.joinById(launched.roomId, {
        role: 'player',
        nickname: 'Sh1t Head',
        deviceKey: randomUUID(),
      }),
    ).rejects.toThrow(/nicknameInvalid/);
  });

  it("launches a game whose code resolves to the room; only the owning organisation's hosts can control it", async () => {
    const launched = await launchTestGameOrThrow(baseUrl, sharedSecret, {
      settings: roomSettingsSchema.parse({ durationMinutes: 10 }),
      questionSet: sampleQuestionSets.spelling,
    });
    expect(launched.joinCode).toMatch(/^\d{6}$/);

    const lookup = await fetch(`${baseUrl}/join-codes/${launched.joinCode}`, {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(await lookup.json()).toEqual({ roomId: launched.roomId });

    await expect(
      colyseus.sdk.joinById(launched.roomId, hostOptions(launched.roomId, 'another-organisation')),
    ).rejects.toThrow(/hostNotAllowed/);
    const host = await colyseus.sdk.joinById(launched.roomId, hostOptions(launched.roomId));
    const player = await colyseus.sdk.joinById(launched.roomId, {
      role: 'player',
      nickname: 'Robo',
      deviceKey: randomUUID(),
    });
    await host.waitForNextPatch();
    expect(host.state.players.size).toBe(1);
    expect(host.state.remainingMs).toBe(10 * 60_000);
    await player.leave();
    await host.leave();
  });

  it('answers unknown codes with 404 and rate-limits lookups per address', async () => {
    const lookup = (code: string) =>
      fetch(`${baseUrl}/join-codes/${code}`, { headers: { 'x-forwarded-for': '10.0.0.2' } });
    expect((await lookup('000000')).status).toBe(404);
    expect((await lookup('nope')).status).toBe(404);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await lookup('123456');
    }
    expect((await lookup('123456')).status).toBe(429);
    // A made-up first hop does not buy a fresh allowance.
    const spoofed = await fetch(`${baseUrl}/join-codes/123456`, {
      headers: { 'x-forwarded-for': '192.0.2.77, 10.0.0.2' },
    });
    expect(spoofed.status).toBe(429);
  });
});

describe('clientAddress', () => {
  const withHeaders = (headers: Record<string, string>) =>
    new Request('http://realtime.test/join-codes/123456', { headers });

  it('trusts the address the nearest proxy appended, not ones the caller made up', () => {
    expect(clientAddress(withHeaders({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientAddress(withHeaders({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
    expect(clientAddress(withHeaders({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientAddress(withHeaders({}))).toBe('unknown');
  });
});

describe('createRateLimiter', () => {
  it('allows the limit per window, per key, then resets', () => {
    let nowMs = 0;
    const allow = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => nowMs });
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    nowMs = 1_000;
    expect(allow('a')).toBe(true);
  });
});
