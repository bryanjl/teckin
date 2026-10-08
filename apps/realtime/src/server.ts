import { createServer, type Server as HttpServer } from 'node:http';
import {
  createEndpoint,
  createRouter,
  defineRoom,
  defineServer,
  matchMaker,
  type Presence,
  type Server,
} from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  launchGamePath,
  launchGamePurpose,
  launchGameRequestSchema,
  type LaunchedGame,
} from '@teckin/game-contracts';
import {
  configureRoomServices,
  createJoinCodeRegistry,
  InMemorySessionRecorder,
  joinCodePattern,
  RoomWorkStats,
  type SessionRecorder,
} from '@teckin/room-core';
import {
  assertSharedSecret,
  verifyHostPass,
  verifySignedRequest,
} from '@teckin/room-core/realtime-trust';
import { checkNickname } from '@teckin/nicknames';
import { serverGameFor, serverGames } from './games';
import { createLoadMetrics } from './load-metrics';
import { createPresenceRateLimiter } from './rate-limiter';

/** Settings the realtime server reads from the environment. */
export interface RealtimeServerOptions {
  /**
   * The secret shared with the web app (`REALTIME_SHARED_SECRET`, at least 32 characters). It
   * checks launch requests and host passes; without it no game can be launched or hosted.
   */
  sharedSecret?: string;
  /** Shared presence (Redis) for several processes; local presence when omitted. */
  presence?: Presence;
  /** Shared matchmaker driver (Redis) for several processes; local when omitted. */
  driver?: matchMaker.MatchMakerDriver;
  /** Public address of this process, when several processes sit behind separate addresses. */
  publicAddress?: string;
  /** Where answer, progress and result events go. In memory unless given. */
  recorder?: SessionRecorder;
  /** Join-code lookups allowed per client address per minute (all processes together). */
  joinLookupsPerMinute?: number;
  /**
   * Lookups allowed per code per minute, whoever asks (all processes together). High enough
   * for a whole class joining at once and retrying.
   */
  lookupsPerCodePerMinute?: number;
  /**
   * Serves `GET /metrics/load` (room work per patch, CPU, memory, event-loop delay) for the
   * load test. Off by default; it only reports numbers, never players.
   */
  loadMetrics?: boolean;
}

/** A configured realtime server, ready to `listen`. */
export interface RealtimeServer {
  gameServer: Server;
  httpServer: HttpServer;
  recorder: SessionRecorder;
}

/**
 * Creates the Colyseus realtime server with its HTTP routes:
 *
 * - `GET /health` for deploy probes;
 * - `GET /join-codes/:code` resolves a 6-digit code to a room id, rate-limited per address and
 *   per code across every process (Redis presence when several run);
 * - `POST /games` launches a game for the web app (a request signed with the shared secret).
 */
export function createRealtimeServer(options: RealtimeServerOptions = {}): RealtimeServer {
  const recorder = options.recorder ?? new InMemorySessionRecorder();
  const workStats = options.loadMetrics ? new RoomWorkStats() : null;
  const sharedSecret = options.sharedSecret;
  if (sharedSecret !== undefined) assertSharedSecret(sharedSecret);
  configureRoomServices({
    recorder,
    checkNickname,
    workMeter: workStats,
    verifyHostPass: sharedSecret ? (pass) => verifyHostPass(sharedSecret, pass) : null,
  });
  const allowLookupFromAddress = createPresenceRateLimiter(() => matchMaker.presence, {
    scope: 'join-lookup-address',
    limit: options.joinLookupsPerMinute ?? 30,
    windowSeconds: 60,
  });
  const allowLookupOfCode = createPresenceRateLimiter(() => matchMaker.presence, {
    scope: 'join-lookup-code',
    limit: options.lookupsPerCodePerMinute ?? 240,
    windowSeconds: 60,
  });

  const health = createEndpoint('/health', { method: 'GET' }, async () =>
    Response.json({ status: 'ok' }),
  );

  const lookupJoinCode = createEndpoint('/join-codes/:code', { method: 'GET' }, async (ctx) => {
    const code = String(ctx.params.code);
    const address = clientAddress(ctx.request);
    const allowed =
      (await allowLookupFromAddress(address)) &&
      (!joinCodePattern.test(code) || (await allowLookupOfCode(code)));
    if (!allowed) {
      return Response.json(
        { error: 'tooManyRequests' },
        { status: 429, headers: { 'retry-after': '60' } },
      );
    }
    const roomId = joinCodePattern.test(code)
      ? await createJoinCodeRegistry(matchMaker.presence).lookup(code)
      : null;
    if (roomId === null) {
      return Response.json({ error: 'unknownCode' }, { status: 404 });
    }
    return Response.json({ roomId });
  });

  const launchGame = createEndpoint(launchGamePath, { method: 'POST' }, async (ctx) => {
    const body = sharedSecret
      ? verifySignedRequest(sharedSecret, launchGamePurpose, ctx.body ?? null)
      : null;
    if (!body) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const request = launchGameRequestSchema.safeParse(body);
    const game = request.success ? serverGameFor(request.data.gameId) : undefined;
    const gameSettings = game?.definition.settingsSchema.safeParse(request.data?.gameSettings);
    if (!request.success || !game || !gameSettings?.success) {
      return Response.json({ error: 'invalidBody' }, { status: 400 });
    }
    const room = await matchMaker.createRoom(game.definition.id, {
      gameId: game.definition.id,
      gameSessionId: request.data.gameSessionId,
      organisationId: request.data.organisationId,
      settings: request.data.settings,
      gameSettings: gameSettings.data,
      questionSet: request.data.questionSet,
    });
    // With several processes the room may live on another one; its listing carries the code.
    const metadata = room.metadata as { joinCode?: unknown } | undefined;
    const joinCode = typeof metadata?.joinCode === 'string' ? metadata.joinCode : '';
    const launched: LaunchedGame = { roomId: room.roomId, joinCode };
    return Response.json(launched, { status: 201 });
  });

  const httpServer = createServer();
  const gameServer = defineServer({
    rooms: Object.fromEntries(
      serverGames.map((game) => [game.definition.id, defineRoom(game.room)]),
    ),
    routes: createRouter({
      health,
      lookupJoinCode,
      launchGame,
      ...(workStats ? { loadMetrics: createLoadMetrics(workStats) } : {}),
    }),
    transport: new WebSocketTransport({ server: httpServer }),
    ...(options.presence ? { presence: options.presence } : {}),
    ...(options.driver ? { driver: options.driver } : {}),
    ...(options.publicAddress ? { publicAddress: options.publicAddress } : {}),
    greet: false,
  });
  return { gameServer, httpServer, recorder };
}

/**
 * The caller's address for rate limiting. Behind Container Apps' ingress (or any one proxy)
 * the proxy appends the address it saw to `X-Forwarded-For`, so the last entry is the one to
 * trust; earlier entries are whatever the caller sent and could be changed on every request
 * to dodge the limit.
 */
export function clientAddress(request: Request | undefined): string {
  const forwarded = request?.headers.get('x-forwarded-for');
  const nearest = forwarded?.split(',').at(-1)?.trim();
  return nearest || request?.headers.get('x-real-ip') || 'unknown';
}
