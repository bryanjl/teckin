import { afterAll, beforeAll, describe } from 'vitest';
import type { PrismaClient } from './client';
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from './testing';

const connectionString = testDatabaseUrl();

/**
 * `describe` with a fresh migrated schema for the block. Skips (with a note) when no database is
 * configured locally; on CI `testDatabaseUrl` throws instead, so the tests always run there.
 */
export function describeWithDatabase(
  name: string,
  body: (getDatabase: () => PrismaClient) => void,
): void {
  if (!connectionString) {
    console.warn(`Skipping "${name}": set DATABASE_URL to run database tests.`);
    describe.skip(name, () => body(() => undefined as never));
    return;
  }
  describe(name, () => {
    let testDatabase: TestDatabase | undefined;
    beforeAll(async () => {
      testDatabase = await createTestDatabase(connectionString);
    });
    afterAll(async () => {
      await testDatabase?.dispose();
    });
    body(() => {
      if (!testDatabase) throw new Error('Test database is not ready yet.');
      return testDatabase.database;
    });
  });
}
