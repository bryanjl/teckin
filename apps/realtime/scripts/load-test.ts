/**
 * Load test for the realtime server: scripted climbers in real rooms over real WebSockets.
 *
 *   pnpm --filter realtime load-test                      # both Phase 3 scenarios
 *   pnpm --filter realtime load-test -- --scenario one-room --seconds 60
 *   pnpm --filter realtime load-test -- --rooms 20 --bots 30   # a custom size
 *   pnpm --filter realtime load-test -- --json results.json    # also write the results
 *   pnpm --filter realtime load-test -- --server http://127.0.0.1:2567 --secret <dev secret>
 *
 * Without `--server` it starts its own realtime process (in-memory presence, load metrics on)
 * on port 2590, so the server's CPU and memory are measured apart from the bots'. Each bot is
 * the same `NetworkBot` the room tests use: a real `ClimberRun` stepped by the course bot,
 * reporting through `ClimberLink` ten times a second, spending and answering through
 * `NetworkSession`. Results are printed as JSON and as a Markdown table row for
 * `docs/load-test.md`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client, type Room as SdkRoom } from '@colyseus/sdk';
import { NetworkBot } from '@teckin/climber/network-bot';
import { hostMessageTypes } from '@teckin/game-contracts';
import { sampleQuestionSets } from '@teckin/questions';
import type { LoadMetricsReport } from '../src/load-metrics';

interface Scenario {
  name: string;
  rooms: number;
  botsPerRoom: number;
}

const scenarios: Record<string, Scenario> = {
  'one-room': { name: 'one-room', rooms: 1, botsPerRoom: 60 },
  'many-rooms': { name: 'many-rooms', rooms: 10, botsPerRoom: 30 },
};

const { values: args } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'all' },
    seconds: { type: 'string', default: '60' },
    warmup: { type: 'string', default: '15' },
    server: { type: 'string' },
    secret: { type: 'string' },
    port: { type: 'string', default: '2590' },
    rooms: { type: 'string' },
    bots: { type: 'string' },
    json: { type: 'string' },
  },
});

const answers = new Map(
  sampleQuestionSets.maths.questions.map((question) => [
    question.id,
    question.options.find((option) => option.isCorrect)!.id,
  ]),
);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One bot plus what the load test counts about it. */
interface LoadBot {
  bot: NetworkBot;
  bytesReceived: number;
  plays: number;
  stopped: boolean;
}

async function main(): Promise<void> {
  const custom: Scenario | null =
    args.rooms || args.bots
      ? {
          name: 'custom',
          rooms: Number(args.rooms ?? 1),
          botsPerRoom: Number(args.bots ?? 30),
        }
      : null;
  const chosen = custom
    ? [custom]
    : args.scenario === 'all'
      ? Object.values(scenarios)
      : [scenarios[args.scenario ?? '']];
  if (chosen.some((scenario) => !scenario)) {
    throw new Error(`Unknown scenario "${args.scenario}"; use one-room, many-rooms or all`);
  }
  const results = [];
  for (const scenario of chosen as Scenario[]) {
    const server = args.server
      ? { url: args.server, secret: args.secret ?? '', stop: async () => {} }
      : await startServer(Number(args.port));
    try {
      results.push(await runScenario(scenario, server.url, server.secret));
    } finally {
      await server.stop();
    }
  }
  console.info('\nResults (JSON):');
  console.info(JSON.stringify(results, null, 2));
  if (args.json) await writeFile(args.json, JSON.stringify(results, null, 2));
  console.info(
    '\n| Scenario | Rooms × bots | Room tick p50 / p95 / p99 / max (ms) | Event loop p99 (ms) | Server CPU (% of a core) | Server RSS (MB) | Down per player (KB/s) | Reports per bot per s | Corrections |',
  );
  console.info('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const result of results) {
    const work = result.server.roomWork;
    console.info(
      `| ${result.scenario} | ${result.rooms} × ${result.botsPerRoom} | ${work.p50Ms} / ${work.p95Ms} / ${work.p99Ms} / ${work.maxMs} | ${result.server.eventLoopDelayMs.p99} | ${result.server.cpuPercentOfOneCore} | ${result.server.memoryMegabytes.rss} | ${result.downstreamKilobytesPerPlayerPerSecond} | ${result.reportsPerBotPerSecond} | ${result.corrections} |`,
    );
  }
}

/** Starts a realtime process with load metrics on and waits for its health check. */
async function startServer(port: number) {
  const secret = randomBytes(18).toString('base64url');
  const realtimeFolder = fileURLToPath(new URL('..', import.meta.url));
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: realtimeFolder,
    env: {
      ...process.env,
      REALTIME_PORT: String(port),
      REALTIME_HOST: '127.0.0.1',
      DEV_GAME_SECRET: secret,
      REALTIME_LOAD_METRICS: '1',
      REDIS_URL: '',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (attempt > 100) throw new Error('The realtime server did not start');
    await sleep(200);
  }
  return {
    url,
    secret,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    },
  };
}

async function runScenario(scenario: Scenario, serverUrl: string, secret: string) {
  const measureSeconds = Number(args.seconds);
  const warmupSeconds = Number(args.warmup);
  console.info(
    `\n${scenario.name}: ${scenario.rooms} room(s) × ${scenario.botsPerRoom} bots, ${warmupSeconds} s warm-up, ${measureSeconds} s measured`,
  );
  const client = new Client(serverUrl);
  const hosts: SdkRoom[] = [];
  const bots: LoadBot[] = [];

  for (let roomIndex = 0; roomIndex < scenario.rooms; roomIndex += 1) {
    const response = await fetch(`${serverUrl}/dev/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret,
        gameId: 'climber',
        settings: { maxPlayers: Math.max(60, scenario.botsPerRoom), durationMinutes: 30 },
        questionSetId: 'maths',
      }),
    });
    if (response.status !== 201) throw new Error(`Creating a game failed: ${response.status}`);
    const game = (await response.json()) as { sessionId: string; hostKey: string };
    const host = await client.joinById(game.sessionId, { role: 'host', hostKey: game.hostKey });
    hosts.push(host);
    // Join in small batches, as a class arriving does, rather than all in one instant.
    for (let first = 0; first < scenario.botsPerRoom; first += 10) {
      const batch = Array.from(
        { length: Math.min(10, scenario.botsPerRoom - first) },
        (_, offset) => joinBot(client, game.sessionId, `Bot ${first + offset + 1}`),
      );
      bots.push(...(await Promise.all(batch)));
    }
  }
  console.info(`  ${bots.length} bots joined; starting the games`);
  for (const host of hosts) host.send(hostMessageTypes.start, {});
  await waitUntil(() => hosts.every((host) => phaseOf(host) === 'playing'), 15_000);

  const loops = bots.map((loadBot) => playLoop(loadBot));
  await sleep(warmupSeconds * 1000);

  const metricsUrl = `${serverUrl}/metrics/load`;
  await fetch(`${metricsUrl}?reset=1`);
  const bytesAtStart = bots.reduce((sum, loadBot) => sum + loadBot.bytesReceived, 0);
  const playsAtStart = bots.reduce((sum, loadBot) => sum + loadBot.plays, 0);
  const botCpuAtStart = process.cpuUsage();
  const startedAt = performance.now();
  await sleep(measureSeconds * 1000);
  const report = (await (await fetch(metricsUrl)).json()) as LoadMetricsReport;
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const botCpu = process.cpuUsage(botCpuAtStart);
  const bytes = bots.reduce((sum, loadBot) => sum + loadBot.bytesReceived, 0) - bytesAtStart;
  const plays = bots.reduce((sum, loadBot) => sum + loadBot.plays, 0) - playsAtStart;

  const heights = bots.map((loadBot) => loadBot.bot.run.heightMetres);
  const result = {
    scenario: scenario.name,
    rooms: scenario.rooms,
    botsPerRoom: scenario.botsPerRoom,
    measuredSeconds: Math.round(elapsedSeconds),
    server: report,
    downstreamKilobytesPerPlayerPerSecond:
      Math.round((bytes / bots.length / elapsedSeconds / 1024) * 10) / 10,
    reportsPerBotPerSecond: Math.round((plays / bots.length / elapsedSeconds) * 10) / 10,
    botProcessCpuPercentOfOneCore:
      Math.round(((botCpu.user + botCpu.system) / 1e6 / elapsedSeconds) * 1000) / 10,
    corrections: bots.reduce((sum, loadBot) => sum + loadBot.bot.link.corrections, 0),
    gamesStillPlaying: hosts.filter((host) => phaseOf(host) === 'playing').length,
    botHeightMetres: { lowest: Math.min(...heights), highest: Math.max(...heights) },
  };
  console.info(
    `  room tick p99 ${report.roomWork.p99Ms} ms, max ${report.roomWork.maxMs} ms; server CPU ${report.cpuPercentOfOneCore}% of a core; RSS ${report.memoryMegabytes.rss} MB`,
  );

  for (const loadBot of bots) loadBot.stopped = true;
  await Promise.all(loops);
  for (const host of hosts) host.send(hostMessageTypes.end, {});
  await sleep(500);
  await Promise.all(
    [...bots.map((loadBot) => loadBot.bot.leave()), ...hosts.map((host) => host.leave())].map(
      (leaving) => leaving.catch(() => undefined),
    ),
  );
  return result;
}

async function joinBot(client: Client, roomId: string, nickname: string): Promise<LoadBot> {
  const room = await client.joinById(roomId, {
    role: 'player',
    nickname,
    deviceKey: randomUUID(),
  });
  const loadBot: LoadBot = { bot: undefined as never, bytesReceived: 0, plays: 0, stopped: false };
  // Count what this "phone" downloads: every frame on its socket.
  const socket = (room as unknown as { connection: { transport: { ws: WebSocket } } }).connection
    .transport.ws;
  socket.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as ArrayBuffer | string;
    loadBot.bytesReceived += typeof data === 'string' ? data.length : data.byteLength;
  });
  loadBot.bot = await NetworkBot.start(room, {
    chooseAnswer: (questionId) => answers.get(questionId)!,
    // Players set off over a few seconds, not in lockstep.
    startDelaySeconds: Math.random() * 4,
  });
  return loadBot;
}

/** Plays a tenth of a second every 100 ms of real time, like a phone, until stopped. */
async function playLoop(loadBot: LoadBot): Promise<void> {
  await sleep(Math.random() * 100);
  while (!loadBot.stopped) {
    const started = performance.now();
    await loadBot.bot.play(0.1);
    loadBot.plays += 1;
    await sleep(Math.max(0, 100 - (performance.now() - started)));
  }
}

function phaseOf(room: SdkRoom): string {
  return String((room.state as { phase?: string } | undefined)?.phase ?? '');
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for the games');
    await sleep(50);
  }
}

await main();
process.exit(0);
