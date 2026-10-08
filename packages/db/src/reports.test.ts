import { expect, it } from 'vitest';
import { createHostWithPersonalOrganisation } from './accounts';
import type { PrismaClient } from './client';
import { buildGameReport, formatAccuracy } from './game-report';
import { organisationData, type QuestionSnapshot } from './organisation-data';
import { describeWithDatabase } from './test-support';

/** A small deterministic generator so the "random" answers are the same on every run. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

async function playedGame(database: PrismaClient, label: string) {
  const { user, organisation } = await createHostWithPersonalOrganisation(database, {
    email: `${label}@example.test`,
  });
  const data = organisationData(database, organisation.id);
  const set = await data.questionSets.create({
    title: `${label} quiz`,
    questions: Array.from({ length: 8 }, (_, index) => ({
      type: index % 3 === 0 ? ('trueFalse' as const) : ('multipleChoice' as const),
      prompt: `Question ${index + 1}`,
      options:
        index % 3 === 0
          ? [
              { text: 'True', isCorrect: index % 2 === 0 },
              { text: 'False', isCorrect: index % 2 !== 0 },
            ]
          : [
              { text: 'A', isCorrect: false },
              { text: 'B', isCorrect: true },
              { text: 'C', isCorrect: false },
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
  const random = seededRandom(label.length * 7919);
  const players = [];
  for (const nickname of ['Swift Otter', 'Brave Lynx', 'Calm Heron', 'Quick Fox', 'Bold Hare']) {
    players.push(await data.participants.add(game.id, { nickname }));
  }
  const answers = [];
  for (const player of players) {
    const count = Math.floor(random() * 25);
    for (let index = 0; index < count; index += 1) {
      const question = snapshot.questions[Math.floor(random() * snapshot.questions.length)]!;
      const option = question.options[Math.floor(random() * question.options.length)]!;
      answers.push({
        participantId: player.id,
        questionId: question.id,
        chosenOptionId: option.id,
        isCorrect: option.isCorrect,
        millisecondsTaken: 500 + Math.floor(random() * 9000),
      });
    }
  }
  await data.answerEvents.record(game.id, answers);
  await data.results.save(
    game.id,
    players.map((player, index) => ({
      participantId: player.id,
      rank: players.length - index,
      gameStats: { bestHeightMetres: 100 * index, summitsReached: index },
    })),
  );
  await data.gameSessions.markEnded(game.id);
  return { data, game, snapshot, players };
}

it('builds an empty report without dividing by zero', () => {
  const report = buildGameReport({
    snapshot: {
      questions: [
        {
          id: 'q1',
          type: 'trueFalse',
          prompt: 'Up?',
          options: [
            { id: 't', text: 'True', isCorrect: true },
            { id: 'f', text: 'False', isCorrect: false },
          ],
        },
      ],
    },
    participants: [{ id: 'p1', nickname: 'Solo', removedAt: null }],
    answers: [],
    results: [],
  });
  expect(report.totals).toEqual({ players: 1, answers: 0, correctAnswers: 0, accuracy: null });
  expect(report.players[0]).toMatchObject({ rank: null, accuracy: null, questionsAnswered: 0 });
  expect(report.questions[0]).toMatchObject({ timesAnswered: 0, accuracy: null });
  expect(formatAccuracy(null)).toBe('–');
  expect(formatAccuracy(2 / 3)).toBe('67%');
});

it('orders questions hardest first, unanswered last, and players by rank', () => {
  const option = (id: string, isCorrect: boolean) => ({ id, text: id, isCorrect });
  const question = (id: string) => ({
    id,
    type: 'trueFalse' as const,
    prompt: id,
    options: [option(`${id}-yes`, true), option(`${id}-no`, false)],
  });
  const answer = (participantId: string, questionId: string, isCorrect: boolean) => ({
    participantId,
    questionId,
    chosenOptionId: `${questionId}-${isCorrect ? 'yes' : 'no'}`,
    isCorrect,
    millisecondsTaken: 1000,
  });
  const report = buildGameReport({
    snapshot: { questions: [question('easy'), question('unseen'), question('hard')] },
    participants: [
      { id: 'a', nickname: 'Zed', removedAt: null },
      { id: 'b', nickname: 'Amy', removedAt: new Date() },
      { id: 'c', nickname: 'Bea', removedAt: null },
    ],
    answers: [
      answer('a', 'easy', true),
      answer('c', 'easy', true),
      answer('a', 'hard', false),
      answer('c', 'hard', true),
    ],
    results: [
      { participantId: 'c', rank: 1, gameStats: { bestHeightMetres: 50, ignored: { nested: 1 } } },
      { participantId: 'a', rank: 2, gameStats: null },
    ],
  });
  expect(report.questions.map((row) => row.questionId)).toEqual(['hard', 'easy', 'unseen']);
  expect(report.players.map((row) => row.nickname)).toEqual(['Bea', 'Zed', 'Amy']);
  expect(report.players[0]!.gameStats).toEqual({ bestHeightMetres: 50 });
  expect(report.players[2]).toMatchObject({ removed: true, rank: null });
  expect(report.questions[0]!.options.map((row) => row.timesChosen)).toEqual([1, 1]);
});

describeWithDatabase('game reports', (getDatabase) => {
  it('match the recorded answers exactly', async () => {
    const { data, game, snapshot, players } = await playedGame(getDatabase(), 'figures');
    const found = await data.reports.forGame(game.id);
    expect(found).not.toBeNull();
    const { report } = found!;
    const recorded = await data.answerEvents.listForGame(game.id);
    expect(recorded.length).toBeGreaterThan(20);

    expect(report.totals.answers).toBe(recorded.length);
    expect(report.totals.correctAnswers).toBe(recorded.filter((row) => row.isCorrect).length);

    for (const player of players) {
      const own = recorded.filter((row) => row.participantId === player.id);
      const row = report.players.find((entry) => entry.participantId === player.id)!;
      const correct = own.filter((answer) => answer.isCorrect).length;
      expect(row.questionsAnswered).toBe(own.length);
      expect(row.correctAnswers).toBe(correct);
      expect(row.accuracy).toBe(own.length === 0 ? null : correct / own.length);
      expect(row.averageMillisecondsTaken).toBe(
        own.length === 0
          ? null
          : Math.round(own.reduce((sum, answer) => sum + answer.millisecondsTaken, 0) / own.length),
      );
    }
    expect(report.players.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(report.players[0]!.gameStats).toEqual({ bestHeightMetres: 400, summitsReached: 4 });

    for (const question of snapshot.questions) {
      const own = recorded.filter((row) => row.questionId === question.id);
      const row = report.questions.find((entry) => entry.questionId === question.id)!;
      expect(row.timesAnswered).toBe(own.length);
      expect(row.correctAnswers).toBe(own.filter((answer) => answer.isCorrect).length);
      for (const option of row.options) {
        expect(option.timesChosen).toBe(
          own.filter((answer) => answer.chosenOptionId === option.optionId).length,
        );
      }
    }
    const accuracies = report.questions
      .map((row) => row.accuracy)
      .filter((accuracy) => accuracy !== null);
    expect(accuracies).toEqual([...accuracies].sort((first, second) => first - second));
    expect(found!.game.questionSetTitle).toBe('figures quiz');
  });

  it('are invisible to another organisation', async () => {
    const database = getDatabase();
    const { game } = await playedGame(database, 'owner');
    const other = await createHostWithPersonalOrganisation(database, {
      email: 'outsider@example.test',
    });
    const outsider = organisationData(database, other.organisation.id);
    expect(await outsider.reports.forGame(game.id)).toBeNull();
    expect(await outsider.gameSessions.listPast()).toEqual([]);
  });

  it('lists ended games as past games, newest first', async () => {
    const { data, game } = await playedGame(getDatabase(), 'pastgames');
    const live = await data.gameSessions.create({
      gameType: 'climber',
      questionSetId: (await data.questionSets.list())[0]!.id,
      settings: {},
      hostUserId: null,
    });
    const past = await data.gameSessions.listPast();
    expect(past.map((row) => row.id)).toEqual([game.id]);
    expect(past[0]).toMatchObject({ _count: { participants: 5 } });
    expect(await data.gameSessions.countLive()).toBe(1);
    await data.gameSessions.markEnded(live.id);
    expect((await data.gameSessions.listPast()).map((row) => row.id)).toEqual([live.id, game.id]);
  });
});
