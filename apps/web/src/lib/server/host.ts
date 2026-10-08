import { listMembershipsForUser, organisationData, type HostMembership } from '@teckin/db';
import { getDatabaseClient } from '@teckin/db/client';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from '../../auth';

/** The signed-in host, the organisation they are acting for, and that organisation's data. */
export interface SignedInHost {
  userId: string;
  email: string;
  name: string | null;
  membership: HostMembership;
  /** Every read and write a page makes goes through this; it is scoped to `membership`. */
  data: ReturnType<typeof organisationData>;
}

/**
 * The signed-in host for this request, or null. The organisation comes from the host's own
 * memberships (their personal one until team invitations exist), never from the request, so a
 * page cannot be pointed at another organisation's data.
 */
export const currentHost = cache(async (): Promise<SignedInHost | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const database = getDatabaseClient();
  const [membership] = await listMembershipsForUser(database, userId);
  if (!membership) return null;
  return {
    userId,
    email: session.user?.email ?? '',
    name: session.user?.name ?? null,
    membership,
    data: organisationData(database, membership.organisationId),
  };
});

/** The signed-in host, or a redirect to sign-in that brings them back to `returnPath`. */
export async function requireHost(returnPath: string): Promise<SignedInHost> {
  const host = await currentHost();
  if (!host) redirect(`/sign-in?callbackUrl=${encodeURIComponent(returnPath)}`);
  return host;
}
