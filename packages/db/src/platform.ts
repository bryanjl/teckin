import { createHash } from 'node:crypto';
import type { PrismaClient } from './client';

/*
 * Platform jobs that are not one organisation's page work: the realtime server's join codes,
 * data retention, account deletion and rate limits. Pages never call these with input they did
 * not check; each says which organisation or user it acts on.
 */

/**
 * Stores a live game's join code. The realtime server has just claimed the code in Redis, so
 * any older game still holding it in the database is stale (its room vanished without being
 * marked ended, for example when a process stopped): that game's code is cleared first, so
 * the unique index never refuses a live game.
 */
export async function storeLiveJoinCode(
  database: PrismaClient,
  game: { gameSessionId: string; organisationId: string; joinCode: string },
): Promise<void> {
  await database.$transaction(async (transaction) => {
    await transaction.gameSession.updateMany({
      where: { joinCode: game.joinCode, id: { not: game.gameSessionId } },
      data: { joinCode: null },
    });
    const updated = await transaction.gameSession.updateMany({
      where: {
        id: game.gameSessionId,
        organisationId: game.organisationId,
        status: { not: 'ended' },
      },
      data: { joinCode: game.joinCode },
    });
    if (updated.count === 0) throw new Error('GameSession not found or already ended');
  });
}

/** Settings for {@link runDataRetention}. */
export interface DataRetentionOptions {
  /** Player answer data older than this many months is deleted. Default 12. */
  playerDataRetentionMonths?: number;
  /** Games still not ended this many hours after launch are marked ended. Default 24. */
  staleGameHours?: number;
  now?: Date;
}

/** What one retention run did. */
export interface DataRetentionSummary {
  staleGamesEnded: number;
  gamesCleared: number;
  participantsDeleted: number;
  strayAnswersDeleted: number;
  expiredRowsDeleted: number;
}

/** Default months player answer data is kept (spec: 12). */
export const defaultPlayerDataRetentionMonths = 12;

/** The moment `months` calendar months before `now`. */
export function monthsBefore(now: Date, months: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

const retentionBatchSize = 200;

/**
 * Deletes player answer data past the retention period: for every game that ended (or, if it
 * never ended, launched) before the cutoff, its players, answers and results go and the game
 * is stamped `playerDataDeletedAt`; the game row and its question snapshot stay so the Past
 * games list still shows it was played. Also ends games whose room vanished without ending,
 * and clears expired sign-in tokens, sessions and rate-limit windows. Safe to run from
 * several processes at once.
 */
export async function runDataRetention(
  database: PrismaClient,
  options: DataRetentionOptions = {},
): Promise<DataRetentionSummary> {
  const now = options.now ?? new Date();
  const months = options.playerDataRetentionMonths ?? defaultPlayerDataRetentionMonths;
  if (!Number.isFinite(months) || months < 1) {
    throw new Error('playerDataRetentionMonths must be at least 1');
  }
  const cutoff = monthsBefore(now, months);
  const staleBefore = new Date(now.getTime() - (options.staleGameHours ?? 24) * 3_600_000);

  const stale = await database.gameSession.updateMany({
    where: { status: { not: 'ended' }, createdAt: { lt: staleBefore } },
    data: { status: 'ended', endedAt: now, joinCode: null },
  });

  let gamesCleared = 0;
  let participantsDeleted = 0;
  for (;;) {
    const games = await database.gameSession.findMany({
      where: {
        playerDataDeletedAt: null,
        OR: [{ endedAt: { lt: cutoff } }, { endedAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true },
      take: retentionBatchSize,
    });
    if (games.length === 0) break;
    const gameIds = games.map((game) => game.id);
    const [, deleted] = await database.$transaction([
      // Answers and results go with their participants (cascade); deleting them first keeps
      // each statement small.
      database.answerEvent.deleteMany({ where: { gameSessionId: { in: gameIds } } }),
      database.participant.deleteMany({ where: { gameSessionId: { in: gameIds } } }),
      database.gameSession.updateMany({
        where: { id: { in: gameIds } },
        data: { playerDataDeletedAt: now },
      }),
    ]);
    gamesCleared += gameIds.length;
    participantsDeleted += deleted.count;
  }

  const strayAnswers = await database.answerEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  const expired = await database.$transaction([
    database.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
    database.session.deleteMany({ where: { expires: { lt: now } } }),
    database.rateLimitWindow.deleteMany({
      where: { windowStartAt: { lt: new Date(now.getTime() - 86_400_000) } },
    }),
  ]);

  return {
    staleGamesEnded: stale.count,
    gamesCleared,
    participantsDeleted,
    strayAnswersDeleted: strayAnswers.count,
    expiredRowsDeleted: expired.reduce((sum, result) => sum + result.count, 0),
  };
}

/**
 * Deletes a host's account. Every organisation the host owns with no other owner is deleted
 * with all its data (sets, games, players, answers, results; the schema cascades from the
 * organisation); organisations with another owner only lose this host's membership. Then the
 * user, their sign-in accounts and sessions go. Returns the organisations deleted.
 */
export async function deleteAccount(
  database: PrismaClient,
  userId: string,
): Promise<{ deletedOrganisationIds: string[] }> {
  return database.$transaction(async (transaction) => {
    const user = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const memberships = await transaction.membership.findMany({
      where: { userId, role: 'owner' },
      select: { organisationId: true },
    });
    const deletedOrganisationIds: string[] = [];
    for (const { organisationId } of memberships) {
      const otherOwners = await transaction.membership.count({
        where: { organisationId, role: 'owner', userId: { not: userId } },
      });
      if (otherOwners === 0) deletedOrganisationIds.push(organisationId);
    }
    if (deletedOrganisationIds.length > 0) {
      await transaction.organisation.deleteMany({ where: { id: { in: deletedOrganisationIds } } });
    }
    await transaction.verificationToken.deleteMany({ where: { identifier: user.email } });
    await transaction.user.delete({ where: { id: userId } });
    return { deletedOrganisationIds };
  });
}

/** The answer of one rate-limit check. */
export interface RateLimitDecision {
  allowed: boolean;
  /** Attempts in the current window, this one included. */
  count: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

/** Hashes a rate-limit key so addresses and emails are never stored as given. */
export function rateLimitKey(scope: string, value: string): string {
  return `${scope}:${createHash('sha256').update(value).digest('base64url')}`;
}

/**
 * Counts one attempt against `key` in a fixed window shared by every web process (a single
 * atomic upsert), and says whether it is within `limit`. Pass a key from {@link rateLimitKey}.
 */
export async function consumeRateLimit(
  database: PrismaClient,
  check: { key: string; limit: number; windowMs: number; now?: Date },
): Promise<RateLimitDecision> {
  const now = check.now ?? new Date();
  const windowOpenAfter = new Date(now.getTime() - check.windowMs);
  const [row] = await database.$queryRaw<{ count: number; windowStartAt: Date }[]>`
    INSERT INTO "RateLimitWindow" ("key", "windowStartAt", "count")
    VALUES (${check.key}, ${now}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitWindow"."windowStartAt" <= ${windowOpenAfter}
                     THEN 1 ELSE "RateLimitWindow"."count" + 1 END,
      "windowStartAt" = CASE WHEN "RateLimitWindow"."windowStartAt" <= ${windowOpenAfter}
                     THEN ${now} ELSE "RateLimitWindow"."windowStartAt" END
    RETURNING "count", "windowStartAt"`;
  if (!row) throw new Error('Rate limit upsert returned nothing');
  const resetsAtMs = row.windowStartAt.getTime() + check.windowMs;
  return {
    allowed: row.count <= check.limit,
    count: row.count,
    retryAfterSeconds: Math.max(1, Math.ceil((resetsAtMs - now.getTime()) / 1000)),
  };
}
