'use server';

import { checkPlanAllows, RecordNotFoundError, StaleEditError } from '@teckin/db';
import { checkAuthoredQuestionSet, type QuestionSetProblem } from '@teckin/questions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHost } from '../../../lib/server/host';
import { planLimits } from '../../../lib/server/platform';
import { copyTitle } from './editor-model';

/** What a save tells the editor. */
export type SaveQuestionSetResult =
  | { ok: true; questionSetId: string; updatedAt: string }
  | { ok: false; reason: 'invalid'; problems: QuestionSetProblem[] }
  | { ok: false; reason: 'stale' | 'missing' }
  | { ok: false; reason: 'planLimit'; limit: number };

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

/**
 * Creates a set from the editor's content. The content is checked again here with the same
 * rules the editor uses, because a server action can be called with anything.
 */
export async function createQuestionSet(content: unknown): Promise<SaveQuestionSetResult> {
  const host = await requireHost('/dashboard/sets/new');
  const checked = checkAuthoredQuestionSet(content);
  if (!checked.ok) return { ok: false, reason: 'invalid', problems: checked.problems };
  const plan = await checkPlanAllows(host.data, planLimits, 'questionSets');
  if (!plan.allowed) return { ok: false, reason: 'planLimit', limit: plan.limit };
  const created = await host.data.questionSets.create({
    title: checked.set.title,
    description: checked.set.description,
    createdById: host.userId,
    questions: checked.set.questions,
  });
  revalidatePath('/dashboard');
  return { ok: true, questionSetId: created.id, updatedAt: created.updatedAt.toISOString() };
}

/**
 * Saves the whole set. `loadedAt` is the set's `updatedAt` when the editor loaded it; a save
 * from another tab since then makes this one refuse rather than overwrite.
 */
export async function saveQuestionSet(
  questionSetId: unknown,
  content: unknown,
  loadedAt: unknown,
): Promise<SaveQuestionSetResult> {
  if (!isUuid(questionSetId)) return { ok: false, reason: 'missing' };
  const host = await requireHost(`/dashboard/sets/${questionSetId}`);
  const checked = checkAuthoredQuestionSet(content);
  if (!checked.ok) return { ok: false, reason: 'invalid', problems: checked.problems };
  const expectedUpdatedAt = typeof loadedAt === 'string' ? new Date(loadedAt) : undefined;
  try {
    const saved = await host.data.questionSets.save(questionSetId, checked.set, {
      expectedUpdatedAt:
        expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
          ? expectedUpdatedAt
          : undefined,
    });
    revalidatePath('/dashboard');
    return { ok: true, questionSetId, updatedAt: saved.updatedAt.toISOString() };
  } catch (error) {
    if (error instanceof StaleEditError) return { ok: false, reason: 'stale' };
    if (error instanceof RecordNotFoundError) return { ok: false, reason: 'missing' };
    throw error;
  }
}

/** Copies a set (as last saved) and opens the copy. */
export async function duplicateQuestionSet(questionSetId: unknown): Promise<void> {
  if (!isUuid(questionSetId)) redirect('/dashboard');
  const host = await requireHost('/dashboard');
  const original = await host.data.questionSets.get(questionSetId);
  if (!original) redirect('/dashboard');
  // The editor has no room for a message here; billing will add one when limits are real.
  if (!(await checkPlanAllows(host.data, planLimits, 'questionSets')).allowed) {
    redirect(`/dashboard/sets/${questionSetId}`);
  }
  const copy = await host.data.questionSets.duplicate(questionSetId, {
    title: copyTitle(original.title),
    createdById: host.userId,
  });
  revalidatePath('/dashboard');
  redirect(`/dashboard/sets/${copy.id}?copied=1`);
}

/** Deletes a set; past games keep their own copy of its questions. */
export async function deleteQuestionSet(questionSetId: unknown): Promise<void> {
  if (isUuid(questionSetId)) {
    const host = await requireHost('/dashboard');
    try {
      await host.data.questionSets.delete(questionSetId);
    } catch (error) {
      if (!(error instanceof RecordNotFoundError)) throw error;
    }
  }
  revalidatePath('/dashboard');
  redirect('/dashboard?deleted=1');
}
