import type { OrganisationData } from './organisation-data';

/** What one plan allows. `null` means unlimited. */
export interface PlanAllowance {
  /** Players in one game. */
  maxPlayersPerGame: number | null;
  /** Games running (not yet ended) at the same time. */
  maxLiveGames: number | null;
  /** Question sets the organisation keeps. */
  maxQuestionSets: number | null;
}

/**
 * Answers "how many players, games and sets may this organisation have". Billing plugs in
 * here later by giving plans real numbers; until then every plan is unlimited.
 */
export interface PlanLimits {
  forPlan(planKey: string): PlanAllowance;
}

/** Every plan unlimited: the platform has no billing yet. */
export const unlimitedPlanLimits: PlanLimits = {
  forPlan: () => ({ maxPlayersPerGame: null, maxLiveGames: null, maxQuestionSets: null }),
};

/** Plan limits from a table of plans; unknown plan keys get `fallback`. */
export function planLimitsFromTable(
  plans: Readonly<Record<string, PlanAllowance>>,
  fallback: PlanAllowance,
): PlanLimits {
  return { forPlan: (planKey) => plans[planKey] ?? fallback };
}

/** A resource an organisation creates more of. */
export type CountedResource = 'liveGames' | 'questionSets';

/** The answer of a plan check. */
export type PlanCheck =
  { allowed: true } | { allowed: false; resource: CountedResource; limit: number };

/**
 * Whether the organisation may create one more `resource` under its plan. Counts through the
 * organisation-scoped data layer, so it can only ever count the organisation's own rows.
 */
export async function checkPlanAllows(
  data: OrganisationData,
  limits: PlanLimits,
  resource: CountedResource,
): Promise<PlanCheck> {
  const { planKey } = await data.organisation.get();
  const allowance = limits.forPlan(planKey);
  const limit = resource === 'liveGames' ? allowance.maxLiveGames : allowance.maxQuestionSets;
  if (limit === null) return { allowed: true };
  const current =
    resource === 'liveGames'
      ? await data.gameSessions.countLive()
      : await data.questionSets.count();
  return current < limit ? { allowed: true } : { allowed: false, resource, limit };
}

/** A game's player cap after the plan: the smaller of the two. */
export function playersAllowedInGame(requested: number, allowance: PlanAllowance): number {
  return allowance.maxPlayersPerGame === null
    ? requested
    : Math.min(requested, allowance.maxPlayersPerGame);
}
