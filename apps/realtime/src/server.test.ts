import { randomUUID } from 'node:crypto';
import type { ColyseusTestServer } from '@colyseus/testing';
import { bootTestServer } from '@teckin/room-core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter';
import { clientAddress, createRealtimeServer, roomNames } from './server';

const devGameSecret = 'test-secret-0123456789';

describe('realtime server', () => {
  const { gameServer } = createRealtimeServer({ devGameSecret, joinLookupsPerMinute: 5 });
  let colyseus: ColyseusTestServer;
  let baseUrl = '';

  beforeAll(async () => {
    ({ colyseus, baseUrl } = await bootTestServer(gameServer));
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  async function createGame(secret = devGameSecret) {
    return fetch(`${baseUrl}/dev/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-game-secret': secret },
      body: JSON.stringify({ gameId: roomNames.climber, settings: { durationMinutes: 10 } }),
    });
  }

  it('reports healthy', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('refuses to create a game without the dev secret', async () => {
    expect((await createGame('wrong')).status).toBe(403);
  });

  it('accepts the dev secret in the body, as the browser page sends it', async () => {
    const send = (secret: string) =>
      fetch(`${baseUrl}/dev/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ gameId: roomNames.climber, secret, questionSetId: 'spelling' }),
      });
    expect((await send('wrong-secret')).status).toBe(403);
    const response = await send(devGameSecret);
    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('refuses nicknames the profanity filter catches', async () => {
    const created = (await (await createGame()).json()) as { sessionId: string };
    await expect(
      colyseus.sdk.joinById(created.sessionId, {
        role: 'player',
        nickname: 'Sh1t Head',
        deviceKey: randomUUID(),
      }),
    ).rejects.toThrow(/nicknameInvalid/);
  });

  it('creates a game whose join code resolves to the room that players and the host can join', async () => {
    const response = await createGame();
    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      sessionId: string;
      joinCode: string;
      hostKey: string;
    };
    expect(created.joinCode).toMatch(/^\d{6}$/);

    const lookup = await fetch(`${baseUrl}/join-codes/${created.joinCode}`, {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(await lookup.json()).toEqual({ roomId: created.sessionId });

    const host = await colyseus.sdk.joinById(created.sessionId, {
      role: 'host',
      hostKey: created.hostKey,
    });
    const player = await colyseus.sdk.joinById(created.sessionId, {
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
