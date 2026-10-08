import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client, type Room as SdkRoom } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const redisUrl = process.env.REDIS_URL;
const devGameSecret = 'test-secret-multi-process-01';
const realtimeFolder = fileURLToPath(new URL('..', import.meta.url));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/** Starts `src/main.ts` as its own process, as each Container App runs it. */
async function startProcess(port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: realtimeFolder,
    env: {
      ...process.env,
      REALTIME_PORT: String(port),
      REALTIME_HOST: '127.0.0.1',
      REALTIME_PUBLIC_ADDRESS: `127.0.0.1:${port}`,
      DEV_GAME_SECRET: devGameSecret,
      REDIS_URL: redisUrl,
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return child;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`The realtime process on ${port} did not start`);
}

function socketUrl(room: SdkRoom): string {
  return (room as unknown as { connection: { transport: { ws: WebSocket } } }).connection.transport
    .ws.url;
}

// The Azure layout (see DECISIONS.md): several processes, each with its own public address,
// sharing Redis. Runs when REDIS_URL points at a Redis server (CI starts one).
describe.runIf(redisUrl)('several realtime processes on shared Redis', () => {
  const processes: ChildProcess[] = [];
  const ports: number[] = [];
  const rooms: SdkRoom[] = [];

  beforeAll(async () => {
    ports.push(await freePort(), await freePort());
    processes.push(...(await Promise.all(ports.map((port) => startProcess(port)))));
  }, 30_000);

  afterAll(async () => {
    await Promise.all(rooms.map((room) => room.leave().catch(() => undefined)));
    for (const child of processes) child.kill('SIGTERM');
    await Promise.all(
      processes.map(
        (child) =>
          new Promise((resolve) =>
            child.exitCode === null ? child.once('exit', resolve) : resolve(0),
          ),
      ),
    );
  }, 30_000);

  it('spreads games over the processes; a code and a join through either reach the right one', async () => {
    const [firstPort, secondPort] = ports as [number, number];
    const entry = `http://127.0.0.1:${firstPort}`;
    const created: { sessionId: string; joinCode: string }[] = [];
    // Colyseus creates each room on the process with the fewest rooms. Processes publish
    // their room counts at most once a second, so games made in one burst can bunch up.
    for (let index = 0; index < 4; index += 1) {
      const response = await fetch(`${entry}/dev/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId: 'climber', secret: devGameSecret }),
      });
      expect(response.status).toBe(201);
      created.push((await response.json()) as { sessionId: string; joinCode: string });
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
    for (const game of created) expect(game.joinCode).toMatch(/^[1-9]\d{5}$/);

    const sockets = new Set<string>();
    for (const [index, game] of created.entries()) {
      // Look the code up on one process and join through the other, as phones might.
      const lookupPort = index % 2 === 0 ? secondPort : firstPort;
      const lookup = (await (
        await fetch(`http://127.0.0.1:${lookupPort}/join-codes/${game.joinCode}`)
      ).json()) as { roomId: string };
      expect(lookup.roomId).toBe(game.sessionId);
      const room = await new Client(`http://127.0.0.1:${lookupPort}`).joinById(game.sessionId, {
        role: 'player',
        nickname: `Player ${index}`,
        deviceKey: randomUUID(),
      });
      rooms.push(room);
      sockets.add(new URL(socketUrl(room)).port);
    }
    // Both processes hold games, and every player's socket went to its game's own process.
    expect([...sockets].sort()).toEqual([String(firstPort), String(secondPort)].sort());
  }, 30_000);
});
