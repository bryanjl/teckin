'use server';

import { redirect } from 'next/navigation';
import { requireHost } from '../../../lib/server/host';
import { deleteHostAccount } from '../../../lib/server/platform';

/** The word a host types to confirm deleting their account. */
const confirmationWord = 'DELETE';

/**
 * Deletes the signed-in host's account and their organisation's data: question sets, games,
 * players, answers and results. Their sessions go with the account, so they are signed out.
 */
export async function deleteAccountAction(form: FormData): Promise<void> {
  const host = await requireHost('/dashboard/account');
  const typed = String(form.get('confirmation') ?? '').trim();
  if (typed.toUpperCase() !== confirmationWord) redirect('/dashboard/account?error=confirm');
  await deleteHostAccount(host.userId);
  redirect('/account-deleted');
}
