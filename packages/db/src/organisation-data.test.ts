import { beforeAll, expect, it } from 'vitest';
import { createHostWithPersonalOrganisation } from './accounts';
import type { PrismaClient } from './client';
import {
  organisationData,
  RecordNotFoundError,
  StaleEditError,
  type OrganisationData,
  type QuestionInput,
  type QuestionSnapshot,
} from './organisation-data';
import { describeWithDatabase } from './test-support';

function sampleQuestions(label: string, count = 5): QuestionInput[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'multipleChoice' as const,
    prompt: `${label} question ${index + 1}`,
    options: [
      { text: 'Right', isCorrect: true },
      { text: 'Wrong', isCorrect: false },
      { text: 'Also wrong', isCorrect: false },
    ],
  }));
}

/** One organisation with a set, a finished game, two players, answers and results. */
async function seedOrganisation(database: PrismaClient, label: string) {
  const { user, organisation } = await createHostWithPersonalOrganisation(database, {
    email: `${label}@example.test`,
    name: label,
  });
  const data = organisationData(database, organisation.id);
  const set = await data.questionSets.create({
    title: `${label} set`,
    createdById: user.id,
    questions: sampleQuestions(label),
  });
  const game = await data.gameSessions.create({
    gameType: 'climber',
    questionSetId: set.id,
    settings: { durationMinutes: 10 },
    hostUserId: user.id,
    joinCode: `${label}-code`,
  });
  const first = await data.participants.add(game.id, { nickname: `${label} One` });
  const second = await data.participants.add(game.id, { nickname: `${label} Two` });
  const snapshot = game.questionSnapshot as unknown as QuestionSnapshot;
  const question = snapshot.questions[0]!;
  await data.answerEvents.record(game.id, [
    {
      participantId: first.id,
      questionId: question.id,
      chosenOptionId: question.options[0]!.id,
      isCorrect: true,
      millisecondsTaken: 2100,
    },
  ]);
  await data.results.save(game.id, [
    { participantId: first.id, rank: 1, gameStats: { bestHeight: 120 } },
    { participantId: second.id, rank: 2, gameStats: { bestHeight: 40 } },
  ]);
  return { user, organisation, data, set, game, participants: [first, second] };
}

type Seeded = Awaited<ReturnType<typeof seedOrganisation>>;

describeWithDatabase('organisation-scoped data access', (getDatabase) => {
  let alpha: Seeded;
  let beta: Seeded;
  let alphaData: OrganisationData;

  beforeAll(async () => {
    alpha = await seedOrganisation(getDatabase(), 'alpha');
    beta = await seedOrganisation(getDatabase(), 'beta');
    alphaData = alpha.data;
  });

  it('lists only its own organisation’s rows', async () => {
    expect((await alphaData.questionSets.list()).map((set) => set.id)).toEqual([alpha.set.id]);
    expect((await alphaData.gameSessions.list()).map((game) => game.id)).toEqual([alpha.game.id]);
    expect((await alphaData.organisation.get()).id).toBe(alpha.organisation.id);
  });

  it('cannot read another organisation’s rows by id', async () => {
    expect(await alphaData.questionSets.get(beta.set.id)).toBeNull();
    expect(await alphaData.gameSessions.get(beta.game.id)).toBeNull();
    expect(await alphaData.participants.listForGame(beta.game.id)).toEqual([]);
    expect(await alphaData.answerEvents.listForGame(beta.game.id)).toEqual([]);
    expect(await alphaData.results.listForGame(beta.game.id)).toEqual([]);
  });

  it('cannot change or delete another organisation’s rows', async () => {
    const attempts = [
      () => alphaData.questionSets.update(beta.set.id, { title: 'Taken over' }),
      () => alphaData.questionSets.replaceQuestions(beta.set.id, sampleQuestions('stolen')),
      () => alphaData.questionSets.delete(beta.set.id),
      () =>
        alphaData.questionSets.save(beta.set.id, {
          title: 'Taken over',
          description: '',
          questions: sampleQuestions('stolen'),
        }),
      () => alphaData.questionSets.duplicate(beta.set.id, { title: 'Copied out' }),
      () => alphaData.gameSessions.attachRoom(beta.game.id, 'stolen-room'),
      () => alphaData.gameSessions.markStarted(beta.game.id),
      () => alphaData.gameSessions.markEnded(beta.game.id),
      () => alphaData.gameSessions.delete(beta.game.id),
      () => alphaData.participants.rename(beta.participants[0]!.id, 'Renamed'),
      () => alphaData.participants.markRemoved(beta.participants[0]!.id),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(RecordNotFoundError);
    }

    const betaSet = await beta.data.questionSets.get(beta.set.id);
    expect(betaSet?.title).toBe('beta set');
    expect(betaSet?.questions[0]?.prompt).toBe('beta question 1');
    const betaGame = await beta.data.gameSessions.get(beta.game.id);
    expect(betaGame).toMatchObject({ status: 'lobby', joinCode: 'beta-code', roomId: null });
    expect((await beta.data.participants.listForGame(beta.game.id)).map((p) => p.nickname)).toEqual(
      ['beta One', 'beta Two'],
    );
  });

  it('cannot attach rows to another organisation’s parents', async () => {
    await expect(
      alphaData.gameSessions.create({
        gameType: 'climber',
        questionSetId: beta.set.id,
        settings: {},
        hostUserId: alpha.user.id,
      }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(
      alphaData.participants.add(beta.game.id, { nickname: 'Intruder' }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(
      alphaData.answerEvents.record(beta.game.id, [
        {
          participantId: beta.participants[0]!.id,
          questionId: 'q',
          chosenOptionId: 'o',
          isCorrect: true,
          millisecondsTaken: 1,
        },
      ]),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(
      alphaData.results.save(beta.game.id, [
        { participantId: beta.participants[0]!.id, rank: 1, gameStats: {} },
      ]),
    ).rejects.toBeInstanceOf(RecordNotFoundError);

    expect(await beta.data.answerEvents.listForGame(beta.game.id)).toHaveLength(1);
    expect((await beta.data.results.listForGame(beta.game.id)).map((r) => r.rank)).toEqual([1, 2]);
  });

  it('copies the set into the game so later edits leave it alone', async () => {
    const snapshot = alpha.game.questionSnapshot as unknown as QuestionSnapshot;
    expect(snapshot.title).toBe('alpha set');
    expect(snapshot.questions).toHaveLength(5);
    expect(snapshot.questions[0]?.options.map((option) => option.isCorrect)).toEqual([
      true,
      false,
      false,
    ]);

    const fresh = await alphaData.questionSets.create({
      title: 'Editable',
      questions: sampleQuestions('before', 2),
    });
    const game = await alphaData.gameSessions.create({
      gameType: 'climber',
      questionSetId: fresh.id,
      settings: {},
      hostUserId: alpha.user.id,
    });
    await alphaData.questionSets.replaceQuestions(fresh.id, sampleQuestions('after', 3));
    await alphaData.questionSets.update(fresh.id, { title: 'Edited' });

    const stored = await alphaData.gameSessions.get(game.id);
    const storedSnapshot = stored?.questionSnapshot as unknown as QuestionSnapshot;
    expect(storedSnapshot.title).toBe('Editable');
    expect(storedSnapshot.questions.map((question) => question.prompt)).toEqual([
      'before question 1',
      'before question 2',
    ]);
    const edited = await alphaData.questionSets.get(fresh.id);
    expect(edited?.questions.map((question) => question.position)).toEqual([0, 1, 2]);
  });

  it('records the realtime room a launched game got', async () => {
    const game = await alphaData.gameSessions.create({
      gameType: 'climber',
      questionSetId: alpha.set.id,
      settings: {},
      hostUserId: alpha.user.id,
    });
    await alphaData.gameSessions.attachRoom(game.id, 'room-abc');
    expect((await alphaData.gameSessions.get(game.id))?.roomId).toBe('room-abc');
    expect((await alphaData.gameSessions.list()).find((row) => row.id === game.id)?.roomId).toBe(
      'room-abc',
    );
  });

  it('frees a join code when its game ends', async () => {
    const set = await alphaData.questionSets.create({
      title: 'Codes',
      questions: sampleQuestions('codes'),
    });
    const launch = () =>
      alphaData.gameSessions.create({
        gameType: 'climber',
        questionSetId: set.id,
        settings: {},
        hostUserId: alpha.user.id,
        joinCode: '123456',
      });
    const first = await launch();
    await expect(launch()).rejects.toThrow();
    await alphaData.gameSessions.markEnded(first.id);
    const second = await launch();
    expect(second.joinCode).toBe('123456');
    expect((await alphaData.gameSessions.get(first.id))?.status).toBe('ended');
  });

  it('keeps games when their set is deleted, and deletes the organisation’s rows with it', async () => {
    const database = getDatabase();
    const doomed = await seedOrganisation(database, 'doomed');
    await doomed.data.questionSets.delete(doomed.set.id);
    expect((await doomed.data.gameSessions.get(doomed.game.id))?.questionSetId).toBeNull();

    await database.organisation.delete({ where: { id: doomed.organisation.id } });
    const where = { organisationId: doomed.organisation.id };
    expect(
      await Promise.all([
        database.questionSet.count({ where }),
        database.question.count({ where }),
        database.answerOption.count({ where }),
        database.gameSession.count({ where }),
        database.participant.count({ where }),
        database.answerEvent.count({ where }),
        database.participantResult.count({ where }),
        database.membership.count({ where }),
      ]),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await beta.data.gameSessions.get(beta.game.id)).not.toBeNull();
  });

  it('saves a whole set at once and refuses a save based on an old copy', async () => {
    const set = await alphaData.questionSets.create({
      title: 'Draft',
      questions: sampleQuestions('draft', 2),
    });
    const loadedAt = set.updatedAt;
    const saved = await alphaData.questionSets.save(
      set.id,
      { title: 'Final', description: 'Fractions', questions: sampleQuestions('final', 6) },
      { expectedUpdatedAt: loadedAt },
    );
    expect(saved.updatedAt.getTime()).toBeGreaterThan(loadedAt.getTime());
    const stored = await alphaData.questionSets.get(set.id);
    expect(stored).toMatchObject({ title: 'Final', description: 'Fractions' });
    expect(stored?.questions.map((question) => question.prompt)).toEqual(
      sampleQuestions('final', 6).map((question) => question.prompt),
    );
    expect(stored?.questions[0]?.answerOptions.map((option) => option.text)).toEqual([
      'Right',
      'Wrong',
      'Also wrong',
    ]);

    // A second tab still holding the first copy cannot overwrite the save above.
    await expect(
      alphaData.questionSets.save(
        set.id,
        { title: 'Old tab', description: '', questions: [] },
        { expectedUpdatedAt: loadedAt },
      ),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect((await alphaData.questionSets.get(set.id))?.title).toBe('Final');
  });

  it('duplicates a set with its questions, leaving the original alone', async () => {
    const copy = await alphaData.questionSets.duplicate(alpha.set.id, {
      title: 'Copy of alpha set',
      createdById: alpha.user.id,
    });
    expect(copy.id).not.toBe(alpha.set.id);
    expect(copy.organisationId).toBe(alpha.organisation.id);
    const [original, copied] = await Promise.all([
      alphaData.questionSets.get(alpha.set.id),
      alphaData.questionSets.get(copy.id),
    ]);
    const shape = (set: typeof original) =>
      set?.questions.map((question) => ({
        type: question.type,
        prompt: question.prompt,
        options: question.answerOptions.map(({ text, isCorrect }) => ({ text, isCorrect })),
      }));
    expect(shape(copied)).toEqual(shape(original));
    expect(copied?.questions[0]?.id).not.toBe(original?.questions[0]?.id);

    await alphaData.questionSets.save(copy.id, {
      title: 'Changed copy',
      description: '',
      questions: [],
    });
    expect((await alphaData.questionSets.get(alpha.set.id))?.questions).toHaveLength(5);
  });

  it('writes a 500-question set quickly enough for one transaction', async () => {
    const started = Date.now();
    const big = await alphaData.questionSets.create({
      title: 'Big import',
      questions: sampleQuestions('big', 500),
    });
    expect(Date.now() - started).toBeLessThan(4000);
    const stored = await alphaData.questionSets.get(big.id);
    expect(stored?.questions).toHaveLength(500);
    expect(stored?.questions[499]?.position).toBe(499);
    expect(stored?.questions[499]?.prompt).toBe('big question 500');
    expect(stored?.questions[499]?.answerOptions).toHaveLength(3);
  });
});
