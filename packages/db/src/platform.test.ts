import { expect, it } from 'vitest';
import { createHostWithPersonalOrganisation } from './accounts';
import type { PrismaClient } from './client';
import { organisationData, type QuestionSnapshot } from './organisation-data';
import {
  checkPlanAllows,
  planLimitsFromTable,
  playersAllowedInGame,
  unlimitedPlanLimits,
} from './plan-limits';
import {
  consumeRateLimit,
  deleteAccount,
  monthsBefore,
  rateLimitKey,
  runDataRetention,
  storeLiveJoinCode,
} from './platform';
import { describeWithDatabase } from './test-support';

/** A host with a set and one played game (two players, answers and results). */
async function hostWithGame(database: PrismaClient, label: string, endedAt?: Date) {
  const { user, organisation } = await createHostWithPersonalOrganisation(database, {
    email: `${label}@example.test`,
  });
  const data = organisationData(database, organisation.id);
  const set = await data.questionSets.create({
    title: `${label} set`,
    createdById: user.id,
    questions: [
      {
        type: 'trueFalse',
        prompt: 'Is it?',
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      },
    ],
  });
  const game = await data.gameSessions.create({
    gameType: 'climber',
    questionSetId: set.id,
    settings: {},
    hostUserId: user.id,
  });
  const question = (game.questionSnapshot as unknown as QuestionSnapshot).questions[0]!;
  const players = [
    await data.participants.add(game.id, { nickname: `${label} A`, reconnectTokenHash: 'hash-a' }),
    await data.participants.add(game.id, { nickname: `${label} B` }),
  ];
  await data.answerEvents.record(
    game.id,
    players.map((player) => ({
      participantId: player.id,
      questionId: question.id,
      chosenOptionId: question.options[0]!.id,
      isCorrect: true,
      millisecondsTaken: 1500,
      createdAt: endedAt,
    })),
  );
  await data.results.save(
    game.id,
    players.map((player, index) => ({ participantId: player.id, rank: index + 1, gameStats: {} })),
  );
  await data.gameSessions.markEnded(game.id, endedAt);
  return { user, organisation, data, game, set };
}

/** Rows that carry this organisation id, in every table that has the column. */
async function rowsOfOrganisation(database: PrismaClient, organisationId: string) {
  const tables = await database.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = 'organisationId'`;
  const counts: Record<string, number> = {};
  for (const { table_name: table } of tables) {
    const [row] = await database.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${table}" WHERE "organisationId" = $1`,
      organisationId,
    );
    counts[table] = Number(row?.count ?? 0);
  }
  const [organisationRow] = await database.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM "Organisation" WHERE id = ${organisationId}`;
  counts.Organisation = Number(organisationRow?.count ?? 0);
  return counts;
}

it('subtracts calendar months for the retention cutoff', () => {
  expect(monthsBefore(new Date('2026-10-09T12:00:00Z'), 12).toISOString()).toBe(
    '2025-10-09T12:00:00.000Z',
  );
});

it('answers unlimited for every plan until billing exists', () => {
  expect(unlimitedPlanLimits.forPlan('free')).toEqual({
    maxPlayersPerGame: null,
    maxLiveGames: null,
    maxQuestionSets: null,
  });
  expect(playersAllowedInGame(60, unlimitedPlanLimits.forPlan('free'))).toBe(60);
  expect(
    playersAllowedInGame(
      60,
      planLimitsFromTable(
        {},
        { maxPlayersPerGame: 30, maxLiveGames: 1, maxQuestionSets: 2 },
      ).forPlan('anything'),
    ),
  ).toBe(30);
});

describeWithDatabase('platform jobs', (getDatabase) => {
  it('deleting an account removes its organisation’s data and nobody else’s', async () => {
    const database = getDatabase();
    const leaving = await hostWithGame(database, 'leaving');
    const staying = await hostWithGame(database, 'staying');
    const before = await rowsOfOrganisation(database, leaving.organisation.id);
    expect(before.AnswerEvent).toBe(2);
    expect(before.Participant).toBe(2);
    expect(before.Question).toBe(1);

    const result = await deleteAccount(database, leaving.user.id);

    expect(result.deletedOrganisationIds).toEqual([leaving.organisation.id]);
    const after = await rowsOfOrganisation(database, leaving.organisation.id);
    expect(Object.values(after).every((count) => count === 0)).toBe(true);
    expect(await database.user.findUnique({ where: { id: leaving.user.id } })).toBeNull();
    expect(await database.membership.count({ where: { userId: leaving.user.id } })).toBe(0);
    const untouched = await rowsOfOrganisation(database, staying.organisation.id);
    expect(untouched).toMatchObject({ Organisation: 1, AnswerEvent: 2, Participant: 2 });
  });

  it('keeps an organisation that has another owner', async () => {
    const database = getDatabase();
    const first = await hostWithGame(database, 'coowner-one');
    const second = await createHostWithPersonalOrganisation(database, {
      email: 'coowner-two@example.test',
    });
    await database.membership.create({
      data: { organisationId: first.organisation.id, userId: second.user.id, role: 'owner' },
    });
    const result = await deleteAccount(database, first.user.id);
    expect(result.deletedOrganisationIds).toEqual([]);
    expect((await rowsOfOrganisation(database, first.organisation.id)).AnswerEvent).toBe(2);
  });

  it('deletes player answer data after the retention period and keeps newer games', async () => {
    const database = getDatabase();
    const now = new Date('2027-06-01T00:00:00Z');
    const old = await hostWithGame(database, 'retention-old', new Date('2026-05-01T00:00:00Z'));
    const recent = await hostWithGame(
      database,
      'retention-recent',
      new Date('2026-07-01T00:00:00Z'),
    );

    const summary = await runDataRetention(database, { now, playerDataRetentionMonths: 12 });

    expect(summary.gamesCleared).toBe(1);
    expect(summary.participantsDeleted).toBe(2);
    const oldRows = await rowsOfOrganisation(database, old.organisation.id);
    expect(oldRows).toMatchObject({ AnswerEvent: 0, Participant: 0, ParticipantResult: 0 });
    expect(oldRows).toMatchObject({ GameSession: 1, QuestionSet: 1 });
    const oldGame = await old.data.gameSessions.get(old.game.id);
    expect(oldGame?.playerDataDeletedAt?.toISOString()).toBe(now.toISOString());
    expect(await rowsOfOrganisation(database, recent.organisation.id)).toMatchObject({
      AnswerEvent: 2,
      Participant: 2,
    });

    // A shorter configured period reaches the newer game too; a second run finds nothing more.
    const shorter = await runDataRetention(database, { now, playerDataRetentionMonths: 6 });
    expect(shorter.gamesCleared).toBeGreaterThanOrEqual(1);
    expect(await rowsOfOrganisation(database, recent.organisation.id)).toMatchObject({
      AnswerEvent: 0,
      Participant: 0,
    });
    expect(
      (await runDataRetention(database, { now, playerDataRetentionMonths: 6 })).gamesCleared,
    ).toBe(0);
  });

  it('ends games whose room vanished and frees their join codes', async () => {
    const database = getDatabase();
    const { data, set } = await hostWithGame(database, 'stale');
    const stuck = await data.gameSessions.create({
      gameType: 'climber',
      questionSetId: set.id,
      settings: {},
      hostUserId: null,
    });
    await storeLiveJoinCode(database, {
      gameSessionId: stuck.id,
      organisationId: data.organisationId,
      joinCode: '424242',
    });
    const later = new Date(Date.now() + 25 * 3_600_000);
    const summary = await runDataRetention(database, { now: later });
    expect(summary.staleGamesEnded).toBe(1);
    expect(await data.gameSessions.get(stuck.id)).toMatchObject({
      status: 'ended',
      joinCode: null,
    });
  });

  it('moves a reused join code from a stale game to the new one', async () => {
    const database = getDatabase();
    const first = await hostWithGame(database, 'codes-one');
    const second = await hostWithGame(database, 'codes-two');
    const launch = async (owner: typeof first) =>
      owner.data.gameSessions.create({
        gameType: 'climber',
        questionSetId: owner.set.id,
        settings: {},
        hostUserId: null,
      });
    const stale = await launch(first);
    const fresh = await launch(second);
    const store = (gameSessionId: string, organisationId: string) =>
      storeLiveJoinCode(database, { gameSessionId, organisationId, joinCode: '135790' });
    await store(stale.id, first.organisation.id);
    await store(fresh.id, second.organisation.id);
    expect((await first.data.gameSessions.get(stale.id))?.joinCode).toBeNull();
    expect((await second.data.gameSessions.get(fresh.id))?.joinCode).toBe('135790');
    // The organisation must match the game.
    await expect(store(fresh.id, first.organisation.id)).rejects.toThrow();
  });

  it('forgets reconnect tokens when a game ends', async () => {
    const database = getDatabase();
    const { data, game } = await hostWithGame(database, 'tokens');
    const participants = await data.participants.listForGame(game.id);
    expect(participants.map((row) => row.reconnectTokenHash)).toEqual([null, null]);
  });

  it('rate-limits within a window and opens again after it', async () => {
    const database = getDatabase();
    const key = rateLimitKey('sign-in-email', 'someone@example.test');
    expect(key).not.toContain('someone');
    const start = new Date('2026-10-09T10:00:00Z');
    const attempt = (offsetMs: number) =>
      consumeRateLimit(database, {
        key,
        limit: 3,
        windowMs: 60_000,
        now: new Date(start.getTime() + offsetMs),
      });
    const decisions = [];
    for (let index = 0; index < 4; index += 1) decisions.push(await attempt(index * 1000));
    expect(decisions.map((decision) => decision.allowed)).toEqual([true, true, true, false]);
    expect(decisions[3]!.retryAfterSeconds).toBe(57);
    expect((await attempt(60_000)).allowed).toBe(true);
    const parallel = await Promise.all(Array.from({ length: 10 }, () => attempt(120_000)));
    expect(parallel.filter((decision) => decision.allowed)).toHaveLength(3);
  });

  it('checks plan limits through the organisation’s own counts', async () => {
    const database = getDatabase();
    const { data } = await hostWithGame(database, 'limits');
    expect(await checkPlanAllows(data, unlimitedPlanLimits, 'questionSets')).toEqual({
      allowed: true,
    });
    const tight = planLimitsFromTable(
      { free: { maxPlayersPerGame: 10, maxLiveGames: 0, maxQuestionSets: 1 } },
      { maxPlayersPerGame: null, maxLiveGames: null, maxQuestionSets: null },
    );
    expect(await checkPlanAllows(data, tight, 'questionSets')).toEqual({
      allowed: false,
      resource: 'questionSets',
      limit: 1,
    });
    expect((await checkPlanAllows(data, tight, 'liveGames')).allowed).toBe(false);
  });
});
