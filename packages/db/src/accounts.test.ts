import { describe, expect, it } from 'vitest';
import {
  createHostWithPersonalOrganisation,
  findMembership,
  listMembershipsForUser,
  personalOrganisationName,
} from './accounts';
import { describeWithDatabase } from './test-support';

describe('personalOrganisationName', () => {
  it('uses the name, then the email, then a fallback', () => {
    expect(personalOrganisationName({ email: 'sam@example.test', name: 'Sam Green' })).toBe(
      "Sam Green's organisation",
    );
    expect(personalOrganisationName({ email: 'sam@example.test', name: '  ' })).toBe(
      "sam's organisation",
    );
    expect(personalOrganisationName({ email: '@example.test', name: null })).toBe(
      'My organisation',
    );
  });

  it('writes a plain apostrophe after a final s and stays short', () => {
    expect(personalOrganisationName({ email: 'x@example.test', name: 'James' })).toBe(
      "James' organisation",
    );
    expect(personalOrganisationName({ email: 'x@y.test', name: 'a'.repeat(200) })).toHaveLength(80);
  });
});

describeWithDatabase('host accounts', (getDatabase) => {
  it('creates a host with a personal organisation they own', async () => {
    const database = getDatabase();
    const { user, organisation } = await createHostWithPersonalOrganisation(database, {
      email: 'Owner@Example.test',
      name: 'Pat',
    });
    expect(user.email).toBe('owner@example.test');
    expect(organisation.name).toBe("Pat's organisation");
    expect(organisation.planKey).toBe('free');

    const memberships = await listMembershipsForUser(database, user.id);
    expect(memberships).toEqual([
      { organisationId: organisation.id, organisationName: organisation.name, role: 'owner' },
    ]);
    expect(await findMembership(database, user.id, organisation.id)).toMatchObject({
      role: 'owner',
    });
  });

  it('finds no membership in an organisation the host does not belong to', async () => {
    const database = getDatabase();
    const first = await createHostWithPersonalOrganisation(database, { email: 'a@example.test' });
    const second = await createHostWithPersonalOrganisation(database, { email: 'b@example.test' });
    expect(await findMembership(database, first.user.id, second.organisation.id)).toBeNull();
  });

  it('creates nothing when the email is already taken', async () => {
    const database = getDatabase();
    await createHostWithPersonalOrganisation(database, { email: 'twice@example.test' });
    const organisationsBefore = await database.organisation.count();
    await expect(
      createHostWithPersonalOrganisation(database, { email: 'twice@example.test' }),
    ).rejects.toThrow();
    expect(await database.organisation.count()).toBe(organisationsBefore);
  });
});
