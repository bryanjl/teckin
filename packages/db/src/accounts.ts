import type { PrismaClient } from './client';
import type { MembershipRole } from './generated/prisma/enums';

/** What is known about a host when their account is first created. */
export interface NewHostAccount {
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: Date | null;
}

/** A host's place in one organisation. */
export interface HostMembership {
  organisationId: string;
  organisationName: string;
  role: MembershipRole;
}

/** Longest organisation name stored; longer derived names are cut. */
export const maximumOrganisationNameLength = 80;

/**
 * Names a new host's personal organisation: "Sam's organisation" from their name, otherwise
 * from the part of their email before the @, so it is recognisable on their dashboard.
 */
export function personalOrganisationName(account: Pick<NewHostAccount, 'email' | 'name'>): string {
  const fromName = account.name?.trim();
  const base = fromName && fromName.length > 0 ? fromName : account.email.split('@')[0]?.trim();
  if (!base) return 'My organisation';
  const possessive = base.endsWith('s') ? `${base}'` : `${base}'s`;
  return `${possessive} organisation`.slice(0, maximumOrganisationNameLength);
}

/**
 * Creates a host and their personal organisation, with the host as its owner, in one
 * transaction: a host never exists without an organisation to work in.
 */
export async function createHostWithPersonalOrganisation(
  database: PrismaClient,
  account: NewHostAccount,
) {
  const email = account.email.trim().toLowerCase();
  return database.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        email,
        name: account.name ?? null,
        image: account.image ?? null,
        emailVerified: account.emailVerified ?? null,
      },
    });
    const organisation = await transaction.organisation.create({
      data: { name: personalOrganisationName({ email, name: account.name ?? null }) },
    });
    await transaction.membership.create({
      data: { organisationId: organisation.id, userId: user.id, role: 'owner' },
    });
    return { user, organisation };
  });
}

/** Every organisation the user belongs to, oldest membership first. */
export async function listMembershipsForUser(
  database: PrismaClient,
  userId: string,
): Promise<HostMembership[]> {
  const memberships = await database.membership.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { organisation: { select: { name: true } } },
  });
  return memberships.map((membership) => ({
    organisationId: membership.organisationId,
    organisationName: membership.organisation.name,
    role: membership.role,
  }));
}

/**
 * The user's membership in one organisation, or null when they do not belong to it. Pages use
 * this to turn a requested organisation id into one the signed-in host may act for.
 */
export async function findMembership(
  database: PrismaClient,
  userId: string,
  organisationId: string,
): Promise<HostMembership | null> {
  const membership = await database.membership.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    include: { organisation: { select: { name: true } } },
  });
  if (!membership) return null;
  return {
    organisationId: membership.organisationId,
    organisationName: membership.organisation.name,
    role: membership.role,
  };
}
