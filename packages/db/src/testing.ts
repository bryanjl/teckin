import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatabaseClient, type PrismaClient } from './client';

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prisma/migrations',
);

/** A throwaway Postgres schema with every migration applied, and a client bound to it. */
export interface TestDatabase {
  database: PrismaClient;
  schema: string;
  /** Disconnects and drops the schema with everything in it. */
  dispose(): Promise<void>;
}

/**
 * The connection string tests use, or null when none is configured. On CI a missing database is
 * an error rather than a silent skip, so database tests can never quietly stop running there.
 */
export function testDatabaseUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  if (!url && process.env.CI) {
    throw new Error('Database tests need DATABASE_URL on CI.');
  }
  return url;
}

/** The SQL of every migration, oldest first, as Prisma Migrate would apply them. */
export async function readMigrations(): Promise<{ name: string; sql: string }[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(path.join(migrationsDirectory, name, 'migration.sql'), 'utf8'),
    })),
  );
}

/**
 * Creates a fresh schema named `test_<random>`, applies the committed migrations to it and
 * returns a client that only sees it. Tests in parallel each get their own, so they never share
 * rows; Prisma Migrate itself is checked on CI with `prisma migrate deploy`.
 */
export async function createTestDatabase(connectionString: string): Promise<TestDatabase> {
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const setup = new pg.Client({ connectionString });
  await setup.connect();
  try {
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`SET search_path TO "${schema}"`);
    for (const migration of await readMigrations()) {
      await setup.query(migration.sql);
    }
  } finally {
    await setup.end();
  }
  const database = createDatabaseClient({ connectionString, schema, maxConnections: 4 });
  return {
    database,
    schema,
    async dispose() {
      await database.$disconnect();
      const teardown = new pg.Client({ connectionString });
      await teardown.connect();
      try {
        await teardown.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await teardown.end();
      }
    },
  };
}
