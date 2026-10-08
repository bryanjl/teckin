import { RedisDriver } from '@colyseus/redis-driver';
import { RedisPresence } from '@colyseus/redis-presence';
import { createRealtimeServer } from './server';

const port = Number(process.env.REALTIME_PORT ?? 2567);
const host = process.env.REALTIME_HOST ?? '0.0.0.0';
const redisUrl = process.env.REDIS_URL?.trim();

// Without REDIS_URL the server runs as a single process with in-memory presence, which is
// all local development needs. Several processes must share Redis for join codes and rooms.
const { gameServer } = createRealtimeServer({
  devGameSecret: process.env.DEV_GAME_SECRET?.trim() || undefined,
  publicAddress: process.env.REALTIME_PUBLIC_ADDRESS?.trim() || undefined,
  loadMetrics: process.env.REALTIME_LOAD_METRICS === '1',
  ...(redisUrl ? { presence: new RedisPresence(redisUrl), driver: new RedisDriver(redisUrl) } : {}),
});

await gameServer.listen(port, host);
console.info(`Realtime server listening on http://${host}:${port}${redisUrl ? ' with Redis' : ''}`);
