/**
 * `@teckin/db`: the Prisma schema, migrations and organisation-scoped data access.
 *
 * Pages and services get an {@link organisationData} for the signed-in host's organisation and
 * use only that; the raw client is for sign-in and platform jobs (`@teckin/db/client`).
 */
export {
  organisationData,
  RecordNotFoundError,
  StaleEditError,
  type AnswerOptionInput,
  type NewAnswerEvent,
  type NewGameSession,
  type NewParticipantResult,
  type NewQuestionSet,
  type OrganisationData,
  type QuestionInput,
  type QuestionSetContent,
  type GameReportWithGame,
  type QuestionSnapshot,
  type SnapshotQuestion,
} from './organisation-data';
export {
  buildGameReport,
  formatAccuracy,
  type GameReport,
  type GameReportInput,
  type OptionReportRow,
  type PlayerReportRow,
  type QuestionReportRow,
} from './game-report';
export {
  checkPlanAllows,
  planLimitsFromTable,
  playersAllowedInGame,
  unlimitedPlanLimits,
  type CountedResource,
  type PlanAllowance,
  type PlanCheck,
  type PlanLimits,
} from './plan-limits';
export {
  consumeRateLimit,
  defaultPlayerDataRetentionMonths,
  deleteAccount,
  monthsBefore,
  rateLimitKey,
  runDataRetention,
  storeLiveJoinCode,
  type DataRetentionOptions,
  type DataRetentionSummary,
  type RateLimitDecision,
} from './platform';
export {
  createHostWithPersonalOrganisation,
  findMembership,
  listMembershipsForUser,
  maximumOrganisationNameLength,
  personalOrganisationName,
  type HostMembership,
  type NewHostAccount,
} from './accounts';
export { createAuthAdapter } from './auth-adapter';
export type { GameSessionStatus, MembershipRole, QuestionType } from './generated/prisma/enums';
