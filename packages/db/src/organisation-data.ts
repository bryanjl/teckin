import type { PrismaClient } from './client';
import { Prisma } from './generated/prisma/client';
import type { GameSessionStatus, QuestionType } from './generated/prisma/enums';

/**
 * Thrown when a record does not exist in the organisation asked about. A record that belongs to
 * another organisation gives exactly the same error, so callers cannot tell the two apart.
 */
export class RecordNotFoundError extends Error {
  constructor(public readonly recordType: string) {
    super(`${recordType} not found`);
    this.name = 'RecordNotFoundError';
  }
}

/** One answer option as the editor and importer supply it. */
export interface AnswerOptionInput {
  text: string;
  isCorrect: boolean;
}

/** One question as the editor and importer supply it; position comes from its place in the list. */
export interface QuestionInput {
  type: QuestionType;
  prompt: string;
  imageUrl?: string | null;
  options: AnswerOptionInput[];
}

/** Fields for a new question set. */
export interface NewQuestionSet {
  title: string;
  description?: string;
  createdById?: string | null;
  questions?: QuestionInput[];
}

/** A question as copied into a game when it launches. */
export interface SnapshotQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  options: { id: string; text: string; isCorrect: boolean }[];
}

/** The question set as it was when a game launched; reports read this, never the live set. */
export interface QuestionSnapshot {
  questionSetId: string;
  title: string;
  questions: SnapshotQuestion[];
}

/** A whole set as the editor saves it: its fields and every question, in order. */
export interface QuestionSetContent {
  title: string;
  description: string;
  questions: QuestionInput[];
}

/**
 * Thrown when a set was saved somewhere else (another tab or device) after the editor loaded
 * it, so saving would silently throw that work away.
 */
export class StaleEditError extends Error {
  constructor(public readonly currentUpdatedAt: Date) {
    super('The question set changed after it was loaded');
    this.name = 'StaleEditError';
  }
}

/** Fields for a new game. */
export interface NewGameSession {
  gameType: string;
  questionSetId: string;
  settings: Prisma.InputJsonValue;
  hostUserId: string | null;
  joinCode?: string | null;
  roomId?: string | null;
}

/** One answer as the session recorder reports it. */
export interface NewAnswerEvent {
  participantId: string;
  questionId: string;
  chosenOptionId: string;
  isCorrect: boolean;
  millisecondsTaken: number;
  createdAt?: Date;
}

/** One player's final placing and the game's own stats for them. */
export interface NewParticipantResult {
  participantId: string;
  rank: number;
  gameStats: Prisma.InputJsonValue;
}

type Transaction = Prisma.TransactionClient;

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** Turns "no such row" (P2025) and "parent not in this organisation" (P2003) into one error. */
async function orNotFound<Result>(recordType: string, work: () => Promise<Result>) {
  try {
    return await work();
  } catch (error) {
    if (isPrismaError(error, 'P2025') || isPrismaError(error, 'P2003')) {
      throw new RecordNotFoundError(recordType);
    }
    throw error;
  }
}

/** Writes `questions` into a set in two queries, however many there are (imports reach 500). */
async function createQuestions(
  transaction: Transaction,
  organisationId: string,
  questionSetId: string,
  questions: QuestionInput[],
) {
  if (questions.length === 0) return;
  const created = await transaction.question.createManyAndReturn({
    data: questions.map((question, questionIndex) => ({
      organisationId,
      questionSetId,
      position: questionIndex,
      type: question.type,
      prompt: question.prompt,
      imageUrl: question.imageUrl ?? null,
    })),
    select: { id: true, position: true },
  });
  const idAtPosition = new Map(created.map((question) => [question.position, question.id]));
  await transaction.answerOption.createMany({
    data: questions.flatMap((question, questionIndex) =>
      question.options.map((option, optionIndex) => ({
        organisationId,
        questionId: idAtPosition.get(questionIndex)!,
        position: optionIndex,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    ),
  });
}

const questionsInOrder = {
  orderBy: { position: 'asc' },
  include: { answerOptions: { orderBy: { position: 'asc' } } },
} as const satisfies Prisma.QuestionSet$questionsArgs;

/**
 * All data access for one organisation. Every query this returns filters by the organisation id
 * it was made with, and every write stamps it, so a page holding one of these cannot reach
 * another organisation's rows. Get one from the signed-in host's membership, never from input.
 */
export function organisationData(database: PrismaClient, organisationId: string) {
  const inOrganisation = { organisationId } as const;

  async function setInOrganisation(transaction: Transaction, questionSetId: string) {
    const found = await transaction.questionSet.findFirst({
      where: { id: questionSetId, ...inOrganisation },
      select: { id: true },
    });
    if (!found) throw new RecordNotFoundError('QuestionSet');
  }

  async function gameInOrganisation(transaction: Transaction, gameSessionId: string) {
    const found = await transaction.gameSession.findFirst({
      where: { id: gameSessionId, ...inOrganisation },
      select: { id: true },
    });
    if (!found) throw new RecordNotFoundError('GameSession');
  }

  return {
    organisationId,

    organisation: {
      /** The organisation's name and plan. */
      get: () =>
        database.organisation.findUniqueOrThrow({
          where: { id: organisationId },
          select: { id: true, name: true, planKey: true, createdAt: true },
        }),
      rename: (name: string) =>
        database.organisation.update({ where: { id: organisationId }, data: { name } }),
    },

    questionSets: {
      /** The organisation's sets, most recently edited first, with question counts. */
      list: () =>
        database.questionSet.findMany({
          where: inOrganisation,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            updatedAt: true,
            _count: { select: { questions: true } },
          },
        }),
      /** One set with its questions and options in order, or null. */
      get: (questionSetId: string) =>
        database.questionSet.findFirst({
          where: { id: questionSetId, ...inOrganisation },
          include: { questions: questionsInOrder },
        }),
      create: (set: NewQuestionSet) =>
        database.$transaction(async (transaction) => {
          const created = await transaction.questionSet.create({
            data: {
              ...inOrganisation,
              title: set.title,
              description: set.description ?? '',
              createdById: set.createdById ?? null,
            },
          });
          await createQuestions(transaction, organisationId, created.id, set.questions ?? []);
          return created;
        }),
      update: (questionSetId: string, fields: { title?: string; description?: string }) =>
        orNotFound('QuestionSet', () =>
          database.questionSet.update({
            where: { id: questionSetId, ...inOrganisation },
            data: fields,
          }),
        ),
      /** Replaces every question in the set, in the given order. */
      replaceQuestions: (questionSetId: string, questions: QuestionInput[]) =>
        database.$transaction(async (transaction) => {
          await setInOrganisation(transaction, questionSetId);
          await transaction.question.deleteMany({ where: { questionSetId, ...inOrganisation } });
          await createQuestions(transaction, organisationId, questionSetId, questions);
          return transaction.questionSet.update({
            where: { id: questionSetId },
            data: { updatedAt: new Date() },
          });
        }),
      /**
       * Saves the title, description and every question in one transaction. With
       * `expectedUpdatedAt` (when the editor loaded the set) it refuses with
       * {@link StaleEditError} if the set was saved since, instead of overwriting that work.
       */
      save: (
        questionSetId: string,
        content: QuestionSetContent,
        options: { expectedUpdatedAt?: Date } = {},
      ) =>
        database.$transaction(async (transaction) => {
          const current = await transaction.questionSet.findFirst({
            where: { id: questionSetId, ...inOrganisation },
            select: { updatedAt: true },
          });
          if (!current) throw new RecordNotFoundError('QuestionSet');
          if (
            options.expectedUpdatedAt &&
            current.updatedAt.getTime() !== options.expectedUpdatedAt.getTime()
          ) {
            throw new StaleEditError(current.updatedAt);
          }
          await transaction.question.deleteMany({ where: { questionSetId, ...inOrganisation } });
          await createQuestions(transaction, organisationId, questionSetId, content.questions);
          return transaction.questionSet.update({
            where: { id: questionSetId },
            data: {
              title: content.title,
              description: content.description,
              updatedAt: new Date(),
            },
          });
        }),
      /** Copies a set with all its questions under a new title; the copy is the host's own. */
      duplicate: (questionSetId: string, copy: { title: string; createdById?: string | null }) =>
        database.$transaction(async (transaction) => {
          const original = await transaction.questionSet.findFirst({
            where: { id: questionSetId, ...inOrganisation },
            include: { questions: questionsInOrder },
          });
          if (!original) throw new RecordNotFoundError('QuestionSet');
          const created = await transaction.questionSet.create({
            data: {
              ...inOrganisation,
              title: copy.title,
              description: original.description,
              createdById: copy.createdById ?? null,
            },
          });
          await createQuestions(
            transaction,
            organisationId,
            created.id,
            original.questions.map((question) => ({
              type: question.type,
              prompt: question.prompt,
              imageUrl: question.imageUrl,
              options: question.answerOptions.map((option) => ({
                text: option.text,
                isCorrect: option.isCorrect,
              })),
            })),
          );
          return created;
        }),
      delete: (questionSetId: string) =>
        orNotFound('QuestionSet', () =>
          database.questionSet.delete({ where: { id: questionSetId, ...inOrganisation } }),
        ),
    },

    gameSessions: {
      /**
       * Creates a game from one of the organisation's sets, copying the set into the game so
       * later edits never change what this game asked or what its report shows.
       */
      create: (game: NewGameSession) =>
        database.$transaction(async (transaction) => {
          const set = await transaction.questionSet.findFirst({
            where: { id: game.questionSetId, ...inOrganisation },
            include: { questions: questionsInOrder },
          });
          if (!set) throw new RecordNotFoundError('QuestionSet');
          const snapshot: QuestionSnapshot = {
            questionSetId: set.id,
            title: set.title,
            questions: set.questions.map((question) => ({
              id: question.id,
              type: question.type,
              prompt: question.prompt,
              imageUrl: question.imageUrl,
              options: question.answerOptions.map((option) => ({
                id: option.id,
                text: option.text,
                isCorrect: option.isCorrect,
              })),
            })),
          };
          return transaction.gameSession.create({
            data: {
              ...inOrganisation,
              gameType: game.gameType,
              questionSetId: set.id,
              settings: game.settings,
              questionSnapshot: snapshot as unknown as Prisma.InputJsonValue,
              hostUserId: game.hostUserId,
              joinCode: game.joinCode ?? null,
              roomId: game.roomId ?? null,
            },
          });
        }),
      /** The organisation's games, newest first. */
      list: (filter: { status?: GameSessionStatus; take?: number } = {}) =>
        database.gameSession.findMany({
          where: { ...inOrganisation, ...(filter.status ? { status: filter.status } : {}) },
          orderBy: { createdAt: 'desc' },
          take: filter.take ?? 50,
          select: {
            id: true,
            gameType: true,
            status: true,
            joinCode: true,
            createdAt: true,
            startedAt: true,
            endedAt: true,
            hostUserId: true,
            roomId: true,
            _count: { select: { participants: true } },
          },
        }),
      get: (gameSessionId: string) =>
        database.gameSession.findFirst({ where: { id: gameSessionId, ...inOrganisation } }),
      /**
       * Records the realtime room a launched game got. The join code is not stored here: the
       * realtime server keeps live codes unique, and a stored code is only freed when the
       * session recorder marks the game ended (M4.4), so storing it now could collide.
       */
      attachRoom: (gameSessionId: string, roomId: string) =>
        orNotFound('GameSession', () =>
          database.gameSession.update({
            where: { id: gameSessionId, ...inOrganisation },
            data: { roomId },
          }),
        ),
      markStarted: (gameSessionId: string, startedAt = new Date()) =>
        orNotFound('GameSession', () =>
          database.gameSession.update({
            where: { id: gameSessionId, ...inOrganisation },
            data: { status: 'playing', startedAt },
          }),
        ),
      /** Ends the game and frees its join code for reuse. */
      markEnded: (gameSessionId: string, endedAt = new Date()) =>
        orNotFound('GameSession', () =>
          database.gameSession.update({
            where: { id: gameSessionId, ...inOrganisation },
            data: { status: 'ended', endedAt, joinCode: null },
          }),
        ),
      delete: (gameSessionId: string) =>
        orNotFound('GameSession', () =>
          database.gameSession.delete({ where: { id: gameSessionId, ...inOrganisation } }),
        ),
    },

    participants: {
      add: (
        gameSessionId: string,
        participant: { nickname: string; reconnectTokenHash?: string | null },
      ) =>
        orNotFound('GameSession', () =>
          database.participant.create({
            data: {
              ...inOrganisation,
              gameSessionId,
              nickname: participant.nickname,
              reconnectTokenHash: participant.reconnectTokenHash ?? null,
            },
          }),
        ),
      listForGame: (gameSessionId: string) =>
        database.participant.findMany({
          where: { gameSessionId, ...inOrganisation },
          orderBy: { joinedAt: 'asc' },
        }),
      rename: (participantId: string, nickname: string) =>
        orNotFound('Participant', () =>
          database.participant.update({
            where: { id: participantId, ...inOrganisation },
            data: { nickname },
          }),
        ),
      markRemoved: (participantId: string, removedAt = new Date()) =>
        orNotFound('Participant', () =>
          database.participant.update({
            where: { id: participantId, ...inOrganisation },
            data: { removedAt },
          }),
        ),
    },

    answerEvents: {
      /** Stores answers for one game; every participant must belong to that game. */
      record: (gameSessionId: string, events: NewAnswerEvent[]) =>
        orNotFound('Participant', () =>
          database.answerEvent.createMany({
            data: events.map((event) => ({ ...inOrganisation, gameSessionId, ...event })),
          }),
        ),
      listForGame: (gameSessionId: string) =>
        database.answerEvent.findMany({
          where: { gameSessionId, ...inOrganisation },
          orderBy: { createdAt: 'asc' },
        }),
    },

    results: {
      /** Stores the final ranking for one game, replacing any earlier one. */
      save: (gameSessionId: string, results: NewParticipantResult[]) =>
        orNotFound('GameSession', () =>
          database.$transaction(async (transaction) => {
            await gameInOrganisation(transaction, gameSessionId);
            await transaction.participantResult.deleteMany({
              where: { gameSessionId, ...inOrganisation },
            });
            return transaction.participantResult.createMany({
              data: results.map((result) => ({ ...inOrganisation, gameSessionId, ...result })),
            });
          }),
        ),
      listForGame: (gameSessionId: string) =>
        database.participantResult.findMany({
          where: { gameSessionId, ...inOrganisation },
          orderBy: { rank: 'asc' },
          include: { participant: { select: { nickname: true } } },
        }),
    },
  };
}

/** The organisation-scoped data access returned by {@link organisationData}. */
export type OrganisationData = ReturnType<typeof organisationData>;
