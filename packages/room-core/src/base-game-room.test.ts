import { randomUUID } from 'node:crypto';
import { defineRoom, defineServer, LocalPresence, matchMaker } from '@colyseus/core';
import type { ColyseusTestServer } from '@colyseus/testing';
import {
  clientRequestTypes,
  hostMessageTypes,
  roomCloseCodes,
  serverMessageTypes,
  type WelcomeMessage,
} from '@teckin/game-contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseGameRoom, configureRoomServices, hashSecret, roomServices } from './base-game-room';
import { createJoinCodeRegistry } from './join-codes';
import { RoomStateBase } from './room-state';
import { InMemorySessionRecorder } from './session-recorder';
import { bootTestServer } from './testing';

const hostKey = 'host-key-for-tests-0123456789';
const recorder = new InMemorySessionRecorder();
let fakeNowMs = 1_000_000;

const server = defineServer({ rooms: { game: defineRoom(BaseGameRoom) }, greet: false });

async function createGame(settings: Record<string, unknown> = {}) {
  return colyseus.createRoom<BaseGameRoom>('game', {
    gameId: 'test-game',
    hostKeyHash: hashSecret(hostKey),
    settings,
  });
}

function playerOptions(nickname: string, deviceKey: string = randomUUID()) {
  return { role: 'player' as const, nickname, deviceKey };
}

/** Advances the fake clock and lets the room tick. */
async function advance(room: BaseGameRoom, milliseconds: number) {
  fakeNowMs += milliseconds;
  await new Promise((resolve) => setTimeout(resolve, 300));
  await room.waitForNextPatch();
}

let colyseus: ColyseusTestServer;

async function whoAmI(room: {
  request: (type: string) => Promise<unknown>;
}): Promise<WelcomeMessage> {
  return (await room.request(clientRequestTypes.whoAmI)) as WelcomeMessage;
}

beforeAll(async () => {
  ({ colyseus } = await bootTestServer(server));
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(() => {
  configureRoomServices({ recorder, now: () => fakeNowMs, reconnectSeconds: 180, joinCodes: null });
});
afterEach(async () => {
  await colyseus.cleanup();
  recorder.clear();
});

describe('BaseGameRoom', () => {
  it('claims a 6-digit join code that resolves to the room and is freed when the game ends', async () => {
    const room = await createGame();
    expect(room.state.joinCode).toMatch(/^\d{6}$/);
    const registry = createJoinCodeRegistry(matchMaker.presence);
    expect(await registry.lookup(room.state.joinCode)).toBe(room.roomId);

    const host = await colyseus.connectTo(room, { role: 'host', hostKey });
    host.send(hostMessageTypes.end, {});
    await room.waitForMessage(hostMessageTypes.end);
    expect(room.state.phase).toBe('ended');
    expect(await registry.lookup(room.state.joinCode)).toBeNull();
  });

  it('admits players into the roster and rejects a wrong host key', async () => {
    const room = await createGame();
    const alice = await colyseus.connectTo(room, playerOptions('Alice'));
    const welcome = await whoAmI(alice);
    expect(welcome).toMatchObject({ nickname: 'Alice', resumed: false });
    await room.waitForNextPatch();
    expect([...room.state.players.values()].map((player) => player.nickname)).toEqual(['Alice']);
    await expect(
      colyseus.connectTo(room, { role: 'host', hostKey: 'wrong-key-wrong-key-1' }),
    ).rejects.toThrow('wrongHostKey');
    expect(recorder.events(room.roomId).map((event) => event.type)).toEqual([
      'sessionStarted',
      'playerJoined',
    ]);
  });

  it('refuses duplicate and invalid nicknames, a locked lobby and a full room', async () => {
    const room = await createGame({ maxPlayers: 2 });
    const host = await colyseus.connectTo(room, { role: 'host', hostKey });
    await colyseus.connectTo(room, playerOptions('Alice'));
    await expect(colyseus.connectTo(room, playerOptions('alice'))).rejects.toThrow('nicknameTaken');
    await expect(colyseus.connectTo(room, playerOptions('<script>'))).rejects.toThrow(
      'nicknameInvalid',
    );

    host.send(hostMessageTypes.lock, { locked: true });
    await room.waitForMessage(hostMessageTypes.lock);
    await expect(colyseus.connectTo(room, playerOptions('Bob'))).rejects.toThrow('locked');
    host.send(hostMessageTypes.lock, { locked: false });
    await room.waitForMessage(hostMessageTypes.lock);
    await colyseus.connectTo(room, playerOptions('Bob'));
    await expect(colyseus.connectTo(room, playerOptions('Cara'))).rejects.toThrow('roomFull');
  });

  it('ignores host commands from players and rejects malformed ones', async () => {
    const room = await createGame();
    const host = await colyseus.connectTo(room, { role: 'host', hostKey });
    const player = await colyseus.connectTo(room, playerOptions('Alice'));
    player.send(hostMessageTypes.start, {});
    await room.waitForMessage(hostMessageTypes.start);
    expect(room.state.phase).toBe('lobby');

    host.send(hostMessageTypes.addTime, { minutes: 'lots' });
    expect(await host.waitForMessage(serverMessageTypes.hostCommandRejected)).toEqual({
      type: hostMessageTypes.addTime,
      reason: 'invalidMessage',
    });
  });

  it('runs lobby, countdown, playing and ended on the server clock, with added time', async () => {
    const room = await createGame({ durationMinutes: 5 });
    const host = await colyseus.connectTo(room, { role: 'host', hostKey });
    host.send(hostMessageTypes.start, {});
    await room.waitForMessage(hostMessageTypes.start);
    expect(room.state.phase).toBe('countdown');

    await advance(room, 3_000);
    expect(room.state.phase).toBe('playing');
    expect(room.state.remainingMs).toBe(5 * 60_000);

    host.send(hostMessageTypes.addTime, { minutes: 2 });
    await room.waitForMessage(hostMessageTypes.addTime);
    await advance(room, 5 * 60_000);
    expect(room.state.phase).toBe('playing');
    expect(room.state.remainingMs).toBe(2 * 60_000);

    await advance(room, 2 * 60_000);
    expect(room.state.phase).toBe('ended');
    expect(room.state.endReason).toBe('timeUp');
  });

  it('closes late join when the host turned it off', async () => {
    const room = await createGame({ allowLateJoin: false });
    const host = await colyseus.connectTo(room, { role: 'host', hostKey });
    host.send(hostMessageTypes.start, {});
    await room.waitForMessage(hostMessageTypes.start);
    await expect(colyseus.connectTo(room, playerOptions('Late'))).rejects.toThrow('lateJoinClosed');
  });

  it('lets a player come back on a new connection with the same device key as the same player', async () => {
    const room = await createGame();
    const deviceKey = randomUUID();
    const first = await colyseus.connectTo(room, playerOptions('Alice', deviceKey));
    const firstWelcome = await whoAmI(first);
    await first.leave(false);
    await room.waitForNextPatch();
    expect(room.state.players.get(firstWelcome.playerId)?.connected).toBe(false);

    const second = await colyseus.connectTo(room, playerOptions('Whatever', deviceKey));
    const secondWelcome = await whoAmI(second);
    expect(secondWelcome).toEqual({
      playerId: firstWelcome.playerId,
      nickname: 'Alice',
      resumed: true,
    });
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);
    expect(room.state.players.get(firstWelcome.playerId)?.connected).toBe(true);
  });

  it('replaces an older connection when the same device joins again (a second tab)', async () => {
    const room = await createGame();
    const deviceKey = randomUUID();
    const firstTab = await colyseus.connectTo(room, playerOptions('Alice', deviceKey));
    firstTab.reconnection.enabled = false;
    const firstClosed = new Promise<number>((resolve) =>
      firstTab.onLeave((code: number) => resolve(code)),
    );
    const secondTab = await colyseus.connectTo(room, playerOptions('Alice', deviceKey));
    expect(await firstClosed).toBe(roomCloseCodes.replaced);
    expect((await whoAmI(secondTab)).resumed).toBe(true);
    await room.waitForNextPatch();
    expect([...room.state.players.values()].map((player) => player.connected)).toEqual([true]);
  });

  it('kicks a player, keeps their device out, and lets them back when the host allows it', async () => {
    const room = await createGame();
    const host = await colyseus.connectTo(room, { role: 'host', hostKey });
    const deviceKey = randomUUID();
    const player = await colyseus.connectTo(room, playerOptions('Mallory', deviceKey));
    const welcome = await whoAmI(player);
    const leaveCode = new Promise<number>((resolve) =>
      player.onLeave((code: number) => resolve(code)),
    );

    host.send(hostMessageTypes.kick, { playerId: welcome.playerId });
    expect(await leaveCode).toBe(roomCloseCodes.kicked);
    await room.waitForNextPatch();
    expect(room.state.players.get(welcome.playerId)?.removed).toBe(true);

    await expect(colyseus.connectTo(room, playerOptions('Mallory2', deviceKey))).rejects.toThrow(
      'kicked',
    );
    host.send(hostMessageTypes.allowKicked, {});
    await room.waitForMessage(hostMessageTypes.allowKicked);
    // The old nickname is free again because removed players leave the active roster.
    const back = await colyseus.connectTo(room, playerOptions('Mallory', deviceKey));
    expect((await whoAmI(back)).resumed).toBe(false);
  });

  it('renames a player for everyone', async () => {
    const room = await createGame();
    const host = await colyseus.connectTo(room, { role: 'host', hostKey });
    const player = await colyseus.connectTo(room, playerOptions('Rude Name'));
    const welcome = await whoAmI(player);
    host.send(hostMessageTypes.rename, { playerId: welcome.playerId, nickname: 'Blue Fox' });
    await room.waitForMessage(hostMessageTypes.rename);
    await player.waitForNextPatch();
    expect(player.state.players.get(welcome.playerId)?.nickname).toBe('Blue Fox');
  });

  it('keeps a dropped player for an automatic reconnect with the Colyseus reconnection token', async () => {
    const room = await createGame();
    const player = await colyseus.connectTo(room, playerOptions('Alice'));
    const welcome = await whoAmI(player);
    const token = player.reconnectionToken;
    player.reconnection.enabled = false;
    player.connection.close(4999);
    await room.waitForNextPatch();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(room.state.players.get(welcome.playerId)?.connected).toBe(false);

    const back = await colyseus.sdk.reconnect(token);
    await room.waitForNextPatch();
    expect(back.sessionId).toBe(player.sessionId);
    expect(room.state.players.get(welcome.playerId)?.connected).toBe(true);
  });
});

describe('room services', () => {
  it('defaults to a three-minute reconnect window', () => {
    configureRoomServices({ reconnectSeconds: 180 });
    expect(roomServices.reconnectSeconds).toBe(180);
  });

  it('builds the state with the shared fields', () => {
    const state = new RoomStateBase();
    expect(state.phase).toBe('lobby');
    expect(state.players.size).toBe(0);
    expect(LocalPresence).toBeDefined();
  });
});
