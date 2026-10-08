/**
 * `@teckin/db`: the Prisma schema, migrations and organisation-scoped data access.
 *
 * Pages and services get an {@link organisationData} for the signed-in host's organisation and
 * use only that; the raw client is for sign-in and platform jobs (`@teckin/db/client`).
 */
export {
  organisationData,
  RecordNotFoundError,
  type AnswerOptionInput,
  type NewAnswerEvent,
  type NewGameSession,
  type NewParticipantResult,
  type NewQuestionSet,
  type OrganisationData,
  type QuestionInput,
  type QuestionSnapshot,
  type SnapshotQuestion,
} from './organisation-data';
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
