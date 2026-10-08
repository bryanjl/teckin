import { RedisDriver } from '@colyseus/redis-driver';
import { RedisPresence } from '@colyseus/redis-presence';
import { defaultPlayerDataRetentionMonths } from '@teckin/db';
import { createDatabaseClient } from '@teckin/db/client';
import { DatabaseSessionRecorder } from './database-recorder';
import { positiveIntegerFromEnvironment, scheduleDataRetention } from './retention-schedule';
import { createRealtimeServer } from './server';

const port = Number(process.env.REALTIME_PORT ?? 2567);
const host = process.env.REALTIME_HOST ?? '0.0.0.0';
const redisUrl = process.env.REDIS_URL?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

// With DATABASE_URL, games launched from the web app are recorded for reports and the data
// retention job runs here. Without it (rooms for local experiments) events stay in memory.
const database = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl }) : null;
if (database) {
  scheduleDataRetention(database, {
    playerDataRetentionMonths: positiveIntegerFromEnvironment(
      process.env.PLAYER_DATA_RETENTION_MONTHS,
      defaultPlayerDataRetentionMonths,
    ),
    intervalMs: 6 * 3_600_000,
    firstRunAfterMs: 60_000 + Math.floor(Math.random() * 60_000),
  });
} else {
  console.warn('DATABASE_URL is not set: games will not be recorded for reports.');
}

// Without REDIS_URL the server runs as a single process with in-memory presence, which is
// all local development needs. Several processes must share Redis for join codes and rooms.
const { gameServer } = createRealtimeServer({
  sharedSecret: process.env.REALTIME_SHARED_SECRET?.trim() || undefined,
  publicAddress: process.env.REALTIME_PUBLIC_ADDRESS?.trim() || undefined,
  loadMetrics: process.env.REALTIME_LOAD_METRICS === '1',
  ...(database ? { recorder: new DatabaseSessionRecorder(database) } : {}),
  ...(redisUrl ? { presence: new RedisPresence(redisUrl), driver: new RedisDriver(redisUrl) } : {}),
});

await gameServer.listen(port, host);
console.info(`Realtime server listening on http://${host}:${port}${redisUrl ? ' with Redis' : ''}`);
