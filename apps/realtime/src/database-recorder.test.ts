// First: @colyseus/testing must load before Prisma's generated client, which defines a global
// `__dirname` that makes Colyseus try `require` for its optional packages.
import { bootTestServer } from '@teckin/room-core/testing';
import { randomUUID } from 'node:crypto';
import type { Room as SdkRoom } from '@colyseus/sdk';
import type { ColyseusTestServer } from '@colyseus/testing';
import {
  hostMessageTypes,
  roomSettingsSchema,
  sessionRequestTypes,
  type PresentedQuestion,
} from '@teckin/game-contracts';
import {
  createHostWithPersonalOrganisation,
  organisationData,
  type QuestionSnapshot,
} from '@teckin/db';
import type { PrismaClient } from '@teckin/db/client';
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '@teckin/db/testing';
import { questionSetSchema } from '@teckin/questions';
import { configureRoomServices } from '@teckin/room-core';
import { issueHostPass } from '@teckin/room-core/realtime-trust';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSessionRecorder } from './database-recorder';
import { createRealtimeServer } from './server';
import { launchTestGameOrThrow } from './test-launch';

const connectionString = testDatabaseUrl();
const sharedSecret = 'realtime-shared-secret-for-recorder-tests-0123';
const describeWithDatabase = connectionString ? describe : describe.skip;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, what: string, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(10);
  }
}

/** A host's organisation with a five-question set and a launched (not yet played) game. */
async function launchedGameRecord(database: PrismaClient, label: string) {
  const { user, organisation } = await createHostWithPersonalOrganisation(database, {
    email: `${label}@example.test`,
  });
  const data = organisationData(database, organisation.id);
  const set = await data.questionSets.create({
    title: `${label} set`,
    questions: Array.from({ length: 5 }, (_, index) => ({
      type: 'multipleChoice' as const,
      prompt: `${index + 2} + ${index + 2}`,
      options: [
        { text: String((index + 2) * 2), isCorrect: true },
        { text: String((index + 2) * 2 + 1), isCorrect: false },
        { text: String((index + 2) * 2 - 1), isCorrect: false },
      ],
    })),
  });
  const game = await data.gameSessions.create({
    gameType: 'climber',
    questionSetId: set.id,
    settings: {},
    hostUserId: user.id,
  });
  const snapshot = game.questionSnapshot as unknown as QuestionSnapshot;
  return { organisation, data, game, snapshot };
}

describeWithDatabase('DatabaseSessionRecorder', () => {
  let testDatabase: TestDatabase;
  let database: PrismaClient;

  beforeAll(async () => {
    testDatabase = await createTestDatabase(connectionString!);
    database = testDatabase.database;
  });
  afterAll(async () => {
    await testDatabase.dispose();
  });

  it('stores events in order even when answers arrive before their player is written', async () => {
    const { data, game, snapshot, organisation } = await launchedGameRecord(database, 'ordering');
    const recorder = new DatabaseSessionRecorder(database);
    const context = { gameSessionId: game.id, organisationId: organisation.id };
    const question = snapshot.questions[0]!;
    const base = { sessionId: 'room-1', ...context };
    recorder.record({
      ...base,
      type: 'sessionStarted',
      gameId: 'climber',
      joinCode: '246810',
      atMs: 1,
    });
    recorder.record({
      ...base,
      type: 'playerJoined',
      playerId: 'p1',
      nickname: 'Ada',
      reconnectTokenHash: 'h1',
      atMs: 2,
    });
    recorder.record({ ...base, type: 'playStarted', atMs: 3 });
    for (let index = 0; index < 30; index += 1) {
      recorder.record({
        ...base,
        type: 'answer',
        playerId: 'p1',
        questionId: question.id,
        chosenOptionId: question.options[index % 3]!.id,
        isCorrect: index % 3 === 0,
        millisecondsTaken: 1000 + index,
        atMs: 10 + index,
      });
    }
    await recorder.flush();
    expect((await data.gameSessions.get(game.id))?.joinCode).toBe('246810');
    recorder.record({
      ...base,
      type: 'playerRenamed',
      playerId: 'p1',
      nickname: 'Ada L',
      atMs: 50,
    });
    recorder.record({
      ...base,
      type: 'result',
      playerId: 'p1',
      rank: 1,
      stats: { bestHeightMetres: 12 },
      atMs: 60,
    });
    recorder.record({ ...base, type: 'sessionEnded', reason: 'hostEnded', atMs: 61 });
    // A room with no database record is ignored.
    recorder.record({ type: 'playStarted', sessionId: 'room-without-record', atMs: 1 });
    await recorder.flush();

    const stored = await data.gameSessions.get(game.id);
    expect(stored).toMatchObject({ status: 'ended', joinCode: null });
    expect(stored?.startedAt?.getTime()).toBe(3);
    expect(stored?.endedAt?.getTime()).toBe(61);
    const [participant] = await data.participants.listForGame(game.id);
    expect(participant).toMatchObject({ nickname: 'Ada L', reconnectTokenHash: null });
    const answers = await data.answerEvents.listForGame(game.id);
    expect(answers).toHaveLength(30);
    expect(answers.filter((answer) => answer.isCorrect)).toHaveLength(10);
    expect(await data.results.listForGame(game.id)).toMatchObject([
      { rank: 1, gameStats: { bestHeightMetres: 12 } },
    ]);
    expect(recorder.trackedSessionCount).toBe(0);
  });

  it('drops a game whose organisation was deleted mid-game without logging every event', async () => {
    const { game, organisation } = await launchedGameRecord(database, 'deleted');
    const errors: string[] = [];
    const recorder = new DatabaseSessionRecorder(database, {
      logError: (message) => errors.push(message),
    });
    const base = { sessionId: 'room-2', gameSessionId: game.id, organisationId: organisation.id };
    await database.organisation.delete({ where: { id: organisation.id } });
    recorder.record({
      ...base,
      type: 'playerJoined',
      playerId: 'p1',
      nickname: 'Bo',
      reconnectTokenHash: 'h',
      atMs: 1,
    });
    recorder.record({
      ...base,
      type: 'playerJoined',
      playerId: 'p2',
      nickname: 'Cy',
      reconnectTokenHash: 'h',
      atMs: 2,
    });
    await recorder.flush();
    expect(errors).toEqual([]);
  });

  describe('with a live room', () => {
    let colyseus: ColyseusTestServer;
    let baseUrl = '';
    let fakeNowMs = 9_000_000;
    let recorder: DatabaseSessionRecorder;

    beforeAll(async () => {
      recorder = new DatabaseSessionRecorder(database);
      const { gameServer } = createRealtimeServer({ sharedSecret, recorder });
      ({ colyseus, baseUrl } = await bootTestServer(gameServer));
      configureRoomServices({ now: () => fakeNowMs });
    });
    afterAll(async () => {
      await colyseus.shutdown();
      configureRoomServices({ now: () => Date.now() });
    });

    it('records a launched game: players, answers, rename, removal, results and the end', async () => {
      const { data, game, snapshot, organisation } = await launchedGameRecord(database, 'live');
      const launched = await launchTestGameOrThrow(baseUrl, sharedSecret, {
        gameSessionId: game.id,
        organisationId: organisation.id,
        settings: roomSettingsSchema.parse({}),
        questionSet: questionSetSchema.parse({
          id: snapshot.questionSetId,
          title: snapshot.title,
          questions: snapshot.questions,
        }),
      });
      const host = await colyseus.sdk.joinById(launched.roomId, {
        role: 'host',
        hostPass: issueHostPass(sharedSecret, {
          roomId: launched.roomId,
          organisationId: organisation.id,
          userId: 'host',
        }),
      });
      const players: SdkRoom[] = [];
      for (const nickname of ['Ava', 'Ben', 'Cy']) {
        players.push(
          await colyseus.sdk.joinById(launched.roomId, {
            role: 'player',
            nickname,
            deviceKey: randomUUID(),
          }),
        );
      }
      await recorder.flush();
      expect((await data.gameSessions.get(game.id))?.joinCode).toBe(launched.joinCode);

      host.send(hostMessageTypes.start, {});
      await waitFor(() => (host.state as { phase: string }).phase === 'countdown', 'countdown');
      fakeNowMs += 3_100;
      await waitFor(() => (host.state as { phase: string }).phase === 'playing', 'play');

      const correctOption = (questionId: string) =>
        snapshot.questions
          .find((question) => question.id === questionId)!
          .options.find((option) => option.isCorrect)!.id;
      const wrongOption = (questionId: string) =>
        snapshot.questions
          .find((question) => question.id === questionId)!
          .options.find((option) => !option.isCorrect)!.id;
      // Ava answers 6 right; Ben 3 right then 1 wrong; Cy 2 right.
      const plan: [number, boolean[]][] = [
        [0, [true, true, true, true, true, true]],
        [1, [true, true, true, false]],
        [2, [true, true]],
      ];
      for (const [index, answers] of plan) {
        const player = players[index]!;
        for (const correct of answers) {
          const question = (await player.request(
            sessionRequestTypes.question,
          )) as PresentedQuestion;
          await player.request(sessionRequestTypes.answer, {
            questionId: question.id,
            chosenOptionId: correct ? correctOption(question.id) : wrongOption(question.id),
          });
          fakeNowMs += 2_000;
        }
      }

      const cyId = [
        ...(host.state as { players: Map<string, { nickname: string }> }).players.entries(),
      ].find(([, player]) => player.nickname === 'Cy')![0];
      const benId = [
        ...(host.state as { players: Map<string, { nickname: string }> }).players.entries(),
      ].find(([, player]) => player.nickname === 'Ben')![0];
      host.send(hostMessageTypes.rename, { playerId: benId, nickname: 'Benji' });
      host.send(hostMessageTypes.kick, { playerId: cyId });
      await sleep(100);
      host.send(hostMessageTypes.end, {});
      await waitFor(() => (host.state as { phase: string }).phase === 'ended', 'the end');
      await sleep(50);
      await recorder.flush();

      const stored = await data.gameSessions.get(game.id);
      expect(stored).toMatchObject({ status: 'ended', joinCode: null });
      expect(stored?.startedAt).not.toBeNull();
      const participants = await data.participants.listForGame(game.id);
      expect(participants.map((participant) => participant.nickname).sort()).toEqual([
        'Ava',
        'Benji',
        'Cy',
      ]);
      expect(
        participants.find((participant) => participant.nickname === 'Cy')?.removedAt,
      ).not.toBeNull();
      expect(participants.every((participant) => participant.reconnectTokenHash === null)).toBe(
        true,
      );

      const found = await data.reports.forGame(game.id);
      const rowFor = (nickname: string) =>
        found!.report.players.find((player) => player.nickname === nickname)!;
      expect(rowFor('Ava')).toMatchObject({ questionsAnswered: 6, correctAnswers: 6 });
      expect(rowFor('Benji')).toMatchObject({ questionsAnswered: 4, correctAnswers: 3 });
      expect(rowFor('Cy')).toMatchObject({
        questionsAnswered: 2,
        correctAnswers: 2,
        removed: true,
      });
      expect(found!.report.totals).toMatchObject({ answers: 12, correctAnswers: 11 });
      // The two players still in the game were ranked by the game; the removed one was not.
      expect(found!.report.players.map((player) => player.rank)).toEqual([1, 2, null]);
      expect(rowFor('Ava').gameStats).toMatchObject({ answered: 6, correct: 6 });

      // The connections close with the server in afterAll (leaving an ended room waits for it).
    }, 30_000);
  });
});
