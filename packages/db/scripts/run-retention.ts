// Runs the data retention job once: `pnpm --filter @teckin/db retention`. The realtime server
// runs the same job every 6 hours; this is for a scheduled job or a manual run.
import { createDatabaseClient } from '../src/client';
import { defaultPlayerDataRetentionMonths, runDataRetention } from '../src/platform';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to run the retention job.');
const months = Number(process.env.PLAYER_DATA_RETENTION_MONTHS ?? defaultPlayerDataRetentionMonths);
const database = createDatabaseClient({ connectionString, maxConnections: 2 });
try {
  const summary = await runDataRetention(database, { playerDataRetentionMonths: months });
  console.info('Data retention finished', summary);
} finally {
  await database.$disconnect();
}
