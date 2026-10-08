import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export { PrismaClient };

/** Where and how to connect. */
export interface DatabaseConnectionOptions {
  /** A PostgreSQL connection string, e.g. `postgresql://user:password@host:5432/teckin`. */
  connectionString: string;
  /** The Postgres schema to use; tests give each run its own. Defaults to `public`. */
  schema?: string;
  /** Pool size; the default suits one web or realtime process. */
  maxConnections?: number;
}

/**
 * Creates a Prisma client over the `pg` driver adapter (Prisma 7 needs an adapter; there is no
 * built-in query engine). Callers own the client and should `$disconnect()` it when done.
 */
export function createDatabaseClient(options: DatabaseConnectionOptions): PrismaClient {
  if (options.schema !== undefined && !/^[a-z_][a-z0-9_]{0,62}$/.test(options.schema)) {
    throw new Error(`Invalid schema name: ${options.schema}`);
  }
  const adapter = new PrismaPg(
    {
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
      ...(options.schema ? { options: `-c search_path="${options.schema}"` } : {}),
    },
    options.schema ? { schema: options.schema } : undefined,
  );
  return new PrismaClient({ adapter });
}

const sharedClientKey = Symbol.for('teckin.databaseClient');

type GlobalWithClient = typeof globalThis & { [sharedClientKey]?: PrismaClient };

/**
 * The process-wide client built from `DATABASE_URL`. Kept on `globalThis` so Next.js hot reloads
 * in development reuse one pool instead of opening a new one per reload.
 */
export function getDatabaseClient(): PrismaClient {
  const holder = globalThis as GlobalWithClient;
  const existing = holder[sharedClientKey];
  if (existing) return existing;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and start Postgres.');
  }
  const client = createDatabaseClient({ connectionString });
  holder[sharedClientKey] = client;
  return client;
}
