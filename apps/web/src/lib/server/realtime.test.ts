import { roomSettingsSchema, type LaunchGameRequest } from '@teckin/game-contracts';
import { sampleQuestionSets } from '@teckin/questions';
import { verifyHostPass, verifySignedRequest } from '@teckin/room-core/realtime-trust';
import { describe, expect, it } from 'vitest';
import { launchOnRealtime, realtimeConnection, signHostPass } from './realtime';

const sharedSecret = 'web-shared-secret-for-tests-0123456789';
const connection = { url: 'http://realtime.test', sharedSecret };
const request: LaunchGameRequest = {
  gameId: 'climber',
  gameSessionId: 'game-1',
  organisationId: 'org-1',
  settings: roomSettingsSchema.parse({}),
  gameSettings: {},
  questionSet: sampleQuestionSets.maths,
};

describe('realtimeConnection', () => {
  it('needs a shared secret of at least 32 characters', () => {
    expect(realtimeConnection({})).toBeNull();
    expect(realtimeConnection({ REALTIME_SHARED_SECRET: 'short' })).toBeNull();
    expect(realtimeConnection({ REALTIME_SHARED_SECRET: sharedSecret })).toEqual({
      url: 'http://127.0.0.1:2567',
      sharedSecret,
    });
    expect(
      realtimeConnection({
        REALTIME_SHARED_SECRET: sharedSecret,
        NEXT_PUBLIC_REALTIME_URL: 'https://public.example/',
        REALTIME_INTERNAL_URL: 'http://internal:2567/',
      })?.url,
    ).toBe('http://internal:2567');
  });
});

describe('launchOnRealtime', () => {
  it('sends a launch the realtime server can verify, and returns the room', async () => {
    let sentBody: unknown;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      expect(url).toBe('http://realtime.test/games');
      sentBody = JSON.parse(String(init.body));
      return Response.json({ roomId: 'room-1', joinCode: '123456' }, { status: 201 });
    }) as typeof fetch;
    const result = await launchOnRealtime(request, connection, fakeFetch);
    expect(result).toEqual({ ok: true, game: { roomId: 'room-1', joinCode: '123456' } });
    expect(verifySignedRequest(sharedSecret, 'launch-game', sentBody)).toMatchObject({
      organisationId: 'org-1',
      gameSessionId: 'game-1',
    });
  });

  it('explains a missing configuration, an unreachable server and a refusal', async () => {
    expect(await launchOnRealtime(request, null)).toEqual({ ok: false, problem: 'notConfigured' });
    const unreachable = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await launchOnRealtime(request, connection, unreachable)).toEqual({
      ok: false,
      problem: 'unreachable',
    });
    const refusing = (async () => Response.json({}, { status: 403 })) as typeof fetch;
    expect(await launchOnRealtime(request, connection, refusing)).toEqual({
      ok: false,
      problem: 'refused',
    });
  });
});

describe('signHostPass', () => {
  it('signs a pass the realtime server accepts, only when configured', () => {
    const claims = { roomId: 'room-1', organisationId: 'org-1', userId: 'user-1' };
    const pass = signHostPass(claims, connection);
    expect(verifyHostPass(sharedSecret, pass!)).toMatchObject(claims);
    expect(signHostPass(claims, null)).toBeNull();
  });
});
