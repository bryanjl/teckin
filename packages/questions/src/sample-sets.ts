import generalKnowledgeData from '../sample-sets/general-knowledge.json' with { type: 'json' };
import mathsData from '../sample-sets/maths.json' with { type: 'json' };
import spellingData from '../sample-sets/spelling.json' with { type: 'json' };
import { parseQuestionSet, type QuestionSet } from './question';

/** Ids of the bundled sample sets, as used by `?set=`. */
export const sampleQuestionSetIds = ['maths', 'spelling', 'general-knowledge'] as const;

/** One of {@link sampleQuestionSetIds}. */
export type SampleQuestionSetId = (typeof sampleQuestionSetIds)[number];

/**
 * The sample question sets (seed JSON in `sample-sets/`), validated on first use. Phase 4
 * seeds them into the database as starter sets.
 */
export const sampleQuestionSets: Readonly<Record<SampleQuestionSetId, QuestionSet>> = {
  maths: parseQuestionSet(mathsData),
  spelling: parseQuestionSet(spellingData),
  'general-knowledge': parseQuestionSet(generalKnowledgeData),
};

/** True when `id` names a bundled sample set. */
export function isSampleQuestionSetId(id: string | undefined): id is SampleQuestionSetId {
  return id !== undefined && (sampleQuestionSetIds as readonly string[]).includes(id);
}
