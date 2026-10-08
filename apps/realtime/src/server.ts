import { randomBytes } from 'node:crypto';
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
import { roomSettingsSchema } from '@teckin/game-contracts';
import { ClimberRoom, climberSettingsSchema } from '@teckin/climber/server';
import {
  type BaseGameRoom,
  configureRoomServices,
  createJoinCodeRegistry,
  hashSecret,
  InMemorySessionRecorder,
  joinCodePattern,
  type SessionRecorder,
} from '@teckin/room-core';
import { sampleQuestionSetIds } from '@teckin/questions';
import { z } from 'zod';
import { createRateLimiter } from './rate-limiter';

/** Settings the realtime server reads from the environment. */
export interface RealtimeServerOptions {
  /**
   * Secret the temporary `/dev/new-game` page sends to create games. Without it, game
   * creation over HTTP is switched off. Phase 4 replaces this with signed-in hosts.
   */
  devGameSecret?: string;
  /** Shared presence (Redis) for several processes; local presence when omitted. */
  presence?: Presence;
  /** Shared matchmaker driver (Redis) for several processes; local when omitted. */
  driver?: matchMaker.MatchMakerDriver;
  /** Public address of this process, when several processes sit behind separate addresses. */
  publicAddress?: string;
  /** Where answer, progress and result events go. In memory unless given. */
  recorder?: SessionRecorder;
  /** Join-code lookups allowed per client address per minute. */
  joinLookupsPerMinute?: number;
}

/** A configured realtime server, ready to `listen`. */
export interface RealtimeServer {
  gameServer: Server;
  httpServer: HttpServer;
  recorder: SessionRecorder;
}

/** Room names the server registers, one per game plug-in. */
export const roomNames = {
  climber: 'climber',
} as const;

const createGameBodySchema = z.object({
  gameId: z.enum([roomNames.climber]),
  settings: roomSettingsSchema.partial().default({}),
  /** One of the bundled sample sets until Phase 4 brings hosts' own sets. */
  questionSetId: z.enum(sampleQuestionSetIds).default('maths'),
  gameSettings: climberSettingsSchema.partial().default({}),
});

/**
 * Creates the Colyseus realtime server with its HTTP routes:
 *
 * - `GET /health` for deploy probes;
 * - `GET /join-codes/:code` resolves a 6-digit code to a room id, rate-limited per address;
 * - `POST /dev/games` creates a game for the temporary `/dev/new-game` page.
 */
export function createRealtimeServer(options: RealtimeServerOptions = {}): RealtimeServer {
  const recorder = options.recorder ?? new InMemorySessionRecorder();
  configureRoomServices({ recorder });
  const allowLookup = createRateLimiter({
    limit: options.joinLookupsPerMinute ?? 30,
    windowMs: 60_000,
  });

  const health = createEndpoint('/health', { method: 'GET' }, async () =>
    Response.json({ status: 'ok' }),
  );

  const lookupJoinCode = createEndpoint('/join-codes/:code', { method: 'GET' }, async (ctx) => {
    const address = clientAddress(ctx.request);
    if (!allowLookup(address)) {
      return Response.json(
        { error: 'tooManyRequests' },
        { status: 429, headers: { 'retry-after': '60' } },
      );
    }
    const code = String(ctx.params.code);
    const roomId = joinCodePattern.test(code)
      ? await createJoinCodeRegistry(matchMaker.presence).lookup(code)
      : null;
    if (roomId === null) {
      return Response.json({ error: 'unknownCode' }, { status: 404 });
    }
    return Response.json({ roomId });
  });

  const createDevGame = createEndpoint('/dev/games', { method: 'POST' }, async (ctx) => {
    const secret = options.devGameSecret;
    const sentSecret = ctx.request?.headers.get('x-dev-game-secret');
    if (!secret || sentSecret !== secret) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const body = createGameBodySchema.safeParse(ctx.body ?? {});
    if (!body.success) {
      return Response.json({ error: 'invalidBody' }, { status: 400 });
    }
    const hostKey = randomBytes(24).toString('base64url');
    const room = await matchMaker.createRoom(body.data.gameId, {
      gameId: body.data.gameId,
      hostKeyHash: hashSecret(hostKey),
      settings: roomSettingsSchema.parse(body.data.settings),
      questionSetId: body.data.questionSetId,
      gameSettings: climberSettingsSchema.parse(body.data.gameSettings),
    });
    const created = matchMaker.getLocalRoomById(room.roomId) as BaseGameRoom | undefined;
    const joinCode = created ? (created.state.joinCode as string) : '';
    return Response.json({ sessionId: room.roomId, joinCode, hostKey }, { status: 201 });
  });

  const httpServer = createServer();
  const gameServer = defineServer({
    rooms: { [roomNames.climber]: defineRoom(ClimberRoom) },
    routes: createRouter({ health, lookupJoinCode, createDevGame }),
    transport: new WebSocketTransport({ server: httpServer }),
    ...(options.presence ? { presence: options.presence } : {}),
    ...(options.driver ? { driver: options.driver } : {}),
    ...(options.publicAddress ? { publicAddress: options.publicAddress } : {}),
    greet: false,
  });
  return { gameServer, httpServer, recorder };
}

/** The caller's address for rate limiting: the first forwarded hop when behind a proxy. */
function clientAddress(request: Request | undefined): string {
  const forwarded = request?.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request?.headers.get('x-real-ip') || 'unknown';
}
