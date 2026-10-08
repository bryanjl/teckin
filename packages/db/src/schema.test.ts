import { expect, it } from 'vitest';
import { createHostWithPersonalOrganisation } from './accounts';
import { organisationData } from './organisation-data';
import { describeWithDatabase } from './test-support';

/** Auth.js tables, the tenant table itself, and Prisma's own bookkeeping. */
const tablesWithoutOrganisation = new Set([
  'User',
  'Account',
  'Session',
  'VerificationToken',
  'Organisation',
  '_prisma_migrations',
]);

describeWithDatabase('database schema', (getDatabase) => {
  it('gives every non-auth table an organisationId', async () => {
    const database = getDatabase();
    const rows = await database.$queryRaw<{ table_name: string; has_organisation: boolean }[]>`
      SELECT t.table_name,
             EXISTS (
               SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = t.table_schema
                 AND c.table_name = t.table_name
                 AND c.column_name = 'organisationId'
                 AND c.is_nullable = 'NO'
             ) AS has_organisation
      FROM information_schema.tables t
      WHERE t.table_schema = current_schema() AND t.table_type = 'BASE TABLE'`;
    const tenantTables = rows.filter((row) => !tablesWithoutOrganisation.has(row.table_name));
    expect(tenantTables.length).toBeGreaterThanOrEqual(8);
    expect(tenantTables.filter((row) => !row.has_organisation)).toEqual([]);
  });

  it('refuses a child row whose organisation differs from its parent’s', async () => {
    const database = getDatabase();
    const owner = await createHostWithPersonalOrganisation(database, { email: 'o@example.test' });
    const other = await createHostWithPersonalOrganisation(database, { email: 'x@example.test' });
    const set = await organisationData(database, owner.organisation.id).questionSets.create({
      title: 'Owned',
    });
    await expect(
      database.question.create({
        data: {
          organisationId: other.organisation.id,
          questionSetId: set.id,
          position: 0,
          type: 'trueFalse',
          prompt: 'Sneaky?',
        },
      }),
    ).rejects.toThrow();
  });

  it('stores nothing personal about players', async () => {
    const database = getDatabase();
    const columns = await database.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Participant'
      ORDER BY column_name`;
    expect(columns.map((column) => column.column_name)).toEqual([
      'gameSessionId',
      'id',
      'joinedAt',
      'nickname',
      'organisationId',
      'reconnectTokenHash',
      'removedAt',
    ]);
  });
});
