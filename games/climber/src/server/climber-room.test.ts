import { randomUUID } from 'node:crypto';
import { defineRoom, defineServer } from '@colyseus/core';
import type { Room as SdkRoom } from '@colyseus/sdk';
import type { ColyseusTestServer } from '@colyseus/testing';
import {
  clientRequestTypes,
  hostMessageTypes,
  sessionMessageTypes,
  sessionRequestTypes,
  type EnergyState,
  type WelcomeMessage,
} from '@teckin/game-contracts';
import { sampleQuestionSets } from '@teckin/questions';
import { InMemorySessionRecorder, configureRoomServices, roomServices } from '@teckin/room-core';
import {
  acceptTestHostPasses,
  bootTestServer,
  testHostJoinOptions,
  testOrganisationId,
} from '@teckin/room-core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NetworkBot } from '../../scripts/network-bot';
import { bundledCourseMap, createClimberCourse } from '../course/course';
import {
  climberClientMessageTypes,
  climberRequestTypes,
  climberServerMessageTypes,
  type ClimberPlacement,
  type Correction,
} from '../protocol';
import { climberGame } from '../definition';
import { defaultClimberTunables } from '../tunables';
import { ClimberRoom, type ClimberRoomState } from './climber-room';

const tunables = defaultClimberTunables;
const course = createClimberCourse(bundledCourseMap, tunables);
const questionSet = sampleQuestionSets.maths;
const recorder = new InMemorySessionRecorder();
let fakeNowMs = 5_000_000;
let colyseus: ColyseusTestServer;

const server = defineServer({ rooms: { climber: defineRoom(ClimberRoom) }, greet: false });

function correctOptionFor(questionId: string): string {
  const question = questionSet.questions.find((item) => item.id === questionId)!;
  return question.options.find((option) => option.isCorrect)!.id;
}

function wrongOptionFor(questionId: string): string {
  const question = questionSet.questions.find((item) => item.id === questionId)!;
  return question.options.find((option) => !option.isCorrect)!.id;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, what: string, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(10);
  }
}

async function createGame(
  gameSettings: Record<string, unknown> = {},
  launched: { questionSet?: unknown } = {},
) {
  const room = await colyseus.createRoom<ClimberRoom>('climber', {
    gameId: 'climber',
    organisationId: testOrganisationId,
    questionSetId: 'maths',
    gameSettings,
    ...launched,
  });
  const host = (await colyseus.connectTo(room, testHostJoinOptions(room.roomId))) as SdkRoom<
    unknown,
    ClimberRoomState
  >;
  return { room, host };
}

async function joinPlayer(room: ClimberRoom, nickname: string, deviceKey = randomUUID()) {
  return (await colyseus.connectTo(room, { role: 'player', nickname, deviceKey })) as SdkRoom<
    unknown,
    ClimberRoomState
  >;
}

/** Starts the game from the host screen and runs the countdown on the fake clock. */
async function startGame(room: ClimberRoom, host: SdkRoom) {
  host.send(hostMessageTypes.start, {});
  await waitFor(() => room.state.phase === 'countdown', 'the countdown');
  fakeNowMs += 3_000;
  await waitFor(() => room.state.phase === 'playing', 'play to start');
}

const startBot = (player: SdkRoom, startDelaySeconds = 0) =>
  NetworkBot.start(player, {
    course,
    tunables,
    chooseAnswer: (questionId) => correctOptionFor(questionId),
    startDelaySeconds,
  });

beforeAll(async () => {
  ({ colyseus } = await bootTestServer(server));
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(() => {
  configureRoomServices({
    recorder,
    now: () => fakeNowMs,
    reconnectSeconds: 180,
    joinCodes: null,
    // The tests fast-forward play, sending far more than ten reports a real second.
    maxMessagesPerSecond: Number.POSITIVE_INFINITY,
  });
  acceptTestHostPasses();
});
afterEach(async () => {
  await colyseus.cleanup();
  recorder.clear();
  configureRoomServices({ maxMessagesPerSecond: 60 });
});

describe('ClimberRoom', () => {
  it('runs a host and three climbers through a full game; everyone sees the same winner and ranking', async () => {
    const { room, host } = await createGame();
    const players = await Promise.all(
      ['Ava', 'Ben', 'Cy'].map((nickname) => joinPlayer(room, nickname)),
    );
    await startGame(room, host);
    // Ben and Cy set off later, so Ava reaches the top first and Ben is higher than Cy.
    const bots = await Promise.all(players.map((player, index) => startBot(player, index * 15)));

    for (let frame = 0; frame < 6_000 && room.state.phase === 'playing'; frame += 1) {
      for (const bot of bots) await bot.play(0.1);
      fakeNowMs += 100;
      await sleep(1);
    }
    await waitFor(
      () => [host, ...players].every((client) => client.state.phase === 'ended'),
      'every screen to see the end',
    );
    await sleep(100);

    const [ava, ben, cy] = bots;
    expect(room.state.endReason).toBe('goalReached');
    for (const client of [host, ...players]) {
      expect(client.state.winnerId).toBe(ava!.playerId);
      const ranks = Object.fromEntries(
        [...client.state.climbers.entries()].map(([playerId, climber]) => [playerId, climber.rank]),
      );
      expect(ranks).toEqual({ [ava!.playerId]: 1, [ben!.playerId]: 2, [cy!.playerId]: 3 });
    }
    const winner = room.state.climbers.get(ava!.playerId)!;
    expect(winner).toMatchObject({ finished: true, summitsReached: course.summits.length });
    expect(winner.heightMetres).toBe(tunables.courseHeightMetres);
    expect(winner.answered).toBeGreaterThan(0);
    expect(winner.correct).toBe(winner.answered);
    // Honest climbers are never corrected, and the server's energy agrees with the devices.
    expect(bots.map((bot) => bot.link.corrections)).toEqual([0, 0, 0]);
    for (const bot of bots) {
      const serverEnergy = (await bot.room.request(sessionRequestTypes.energy)) as EnergyState;
      expect(serverEnergy.energy).toBe(bot.session.energy);
    }
    const events = recorder.events(room.roomId);
    const results = events.filter((event) => event.type === 'result');
    expect(results.map((event) => event.type === 'result' && event.rank)).toEqual([1, 2, 3]);
    // Every column the report shows is in what the room records.
    for (const event of results) {
      if (event.type !== 'result') continue;
      for (const column of climberGame.reportColumns)
        expect(event.stats).toHaveProperty(column.key);
    }
    // The recorder also saw every answer and every summit along the way.
    const answersOf = (playerId: string) =>
      events.filter((event) => event.type === 'answer' && event.playerId === playerId).length;
    expect(answersOf(ava!.playerId)).toBe(winner.answered);
    const winnerSummits = events.filter(
      (event) => event.type === 'progress' && event.playerId === ava!.playerId,
    );
    expect(winnerSummits).toHaveLength(course.summits.length);
    expect(ben!.run.heightMetres).toBeGreaterThan(cy!.run.heightMetres);
  }, 120_000);

  it('resumes a player who was gone for 60 seconds with the same energy and height', async () => {
    const { room, host } = await createGame();
    const deviceKey = randomUUID();
    const player = await joinPlayer(room, 'Dee', deviceKey);
    await startGame(room, host);
    const bot = await startBot(player);
    for (let frame = 0; frame < 150; frame += 1) {
      await bot.play(0.1);
      fakeNowMs += 100;
      await sleep(1);
    }
    await sleep(200);
    const before = room.state.climbers.get(bot.playerId)!;
    const heightBefore = before.heightMetres;
    const energyBefore = ((await player.request(sessionRequestTypes.energy)) as EnergyState).energy;
    expect(heightBefore).toBeGreaterThan(0);

    // The phone locks: the connection drops without saying goodbye.
    const token = player.reconnectionToken;
    player.reconnection.enabled = false;
    player.connection.close(4999);
    await waitFor(() => room.state.players.get(bot.playerId)?.connected === false, 'the drop');
    fakeNowMs += 60_000;
    await sleep(300);

    // Back with the automatic reconnect...
    const back = (await colyseus.sdk.reconnect(token)) as SdkRoom<unknown, ClimberRoomState>;
    const welcome = (await back.request(clientRequestTypes.whoAmI)) as WelcomeMessage;
    expect(welcome.playerId).toBe(bot.playerId);
    const energyBack = ((await back.request(sessionRequestTypes.energy)) as EnergyState).energy;
    const placement = (await back.request(climberRequestTypes.placement)) as ClimberPlacement;
    expect(energyBack).toBe(energyBefore);
    expect(placement).toMatchObject({ x: bot.run.foot.x, y: bot.run.foot.y });
    expect(room.state.climbers.get(bot.playerId)?.heightMetres).toBe(heightBefore);

    // ...and, after the tab was discarded, on a fresh connection with the same device key.
    back.reconnection.enabled = false;
    back.connection.close(4999);
    await waitFor(() => room.state.players.get(bot.playerId)?.connected === false, 'second drop');
    const fresh = await joinPlayer(room, 'Anything', deviceKey);
    const resumed = await startBot(fresh);
    expect(resumed.playerId).toBe(bot.playerId);
    expect(resumed.session.energy).toBe(energyBefore);
    expect(Math.round(resumed.run.heightMetres)).toBe(heightBefore);
    expect(resumed.run.progress.goalsReached).toBe(bot.run.progress.goalsReached);

    // The new page numbers its reports from 1 again; the room still follows the climb.
    for (let frame = 0; frame < 100; frame += 1) {
      await resumed.play(0.1);
      fakeNowMs += 100;
      await sleep(1);
    }
    await waitFor(
      () => (room.state.climbers.get(bot.playerId)?.heightMetres ?? 0) > heightBefore,
      'the resumed climb to count',
    );
    expect(resumed.link.corrections).toBe(0);
  }, 60_000);

  it('gives nothing for impossible positions, forged answers, unknown spends or unpaid jumps', async () => {
    const { room, host } = await createGame();
    const cheat = await joinPlayer(room, 'Mallory');
    const welcome = (await cheat.request(clientRequestTypes.whoAmI)) as WelcomeMessage;
    const corrections: Correction[] = [];
    cheat.onMessage(climberServerMessageTypes.correction, (message: Correction) =>
      corrections.push(message),
    );
    // Before the game starts, questions are not available.
    await expect(cheat.request(sessionRequestTypes.question)).rejects.toThrow('notPlaying');
    await startGame(room, host);

    // Teleport to the top claiming every summit.
    const top = course.summits[course.summits.length - 1]!;
    cheat.send(climberClientMessageTypes.move, {
      seq: 1,
      x: top.respawnX,
      y: top.respawnY,
      onGround: true,
      summits: 6,
      correctionId: 0,
    });
    await waitFor(() => corrections.length === 1, 'a correction');
    expect(corrections[0]).toMatchObject({
      x: course.spawn.x,
      y: course.spawn.y,
      summitsReached: 0,
    });

    // Reports sent before the correction was applied are ignored, not corrected again.
    cheat.send(climberClientMessageTypes.move, {
      seq: 2,
      x: top.respawnX,
      y: top.respawnY,
      onGround: true,
      summits: 6,
      correctionId: 0,
    });
    // A free "jump": unknown spend reasons cost nothing and pay for nothing.
    cheat.send(sessionMessageTypes.spend, { firstSeq: 1, reasons: ['teleport'] });
    cheat.send(climberClientMessageTypes.move, {
      seq: 3,
      x: course.spawn.x,
      y: course.spawn.y - 3 * tunables.physics.tileSize,
      onGround: false,
      summits: 0,
      correctionId: 1,
    });
    await waitFor(() => corrections.length === 2, 'a second correction');
    expect(corrections[1]?.correctionId).toBe(2);

    // Forged answers: another question, a made-up option, and guessing past the reveal.
    const current = (await cheat.request(sessionRequestTypes.question)) as { id: string };
    const other = questionSet.questions.find((question) => question.id !== current.id)!;
    await expect(
      cheat.request(sessionRequestTypes.answer, {
        questionId: other.id,
        chosenOptionId: correctOptionFor(other.id),
      }),
    ).rejects.toThrow('invalidAnswer');
    await expect(
      cheat.request(sessionRequestTypes.answer, { questionId: current.id, chosenOptionId: 'zz' }),
    ).rejects.toThrow('invalidAnswer');
    await cheat.request(sessionRequestTypes.answer, {
      questionId: current.id,
      chosenOptionId: wrongOptionFor(current.id),
    });
    const next = (await cheat.request(sessionRequestTypes.question)) as { id: string };
    await expect(
      cheat.request(sessionRequestTypes.answer, {
        questionId: next.id,
        chosenOptionId: correctOptionFor(next.id),
      }),
    ).rejects.toThrow('tooSoon');

    // Spend almost everything on two jumps and land; a third jump the server cannot charge
    // for buys no height.
    const at = (seq: number, rise: number, onGround: boolean) =>
      cheat.send(climberClientMessageTypes.move, {
        seq,
        x: course.spawn.x,
        y: course.spawn.y - rise * tunables.physics.tileSize,
        onGround,
        summits: 0,
        correctionId: 2,
      });
    cheat.send(sessionMessageTypes.spend, { firstSeq: 2, reasons: ['jump', 'jump'] });
    at(4, 0, true);
    at(5, 0, true);
    cheat.send(sessionMessageTypes.spend, { firstSeq: 4, reasons: ['jump'] });
    at(6, 2, false);
    await waitFor(() => corrections.length === 3, 'a third correction');

    await sleep(100);
    const state = (await cheat.request(sessionRequestTypes.energy)) as EnergyState;
    expect(state.energy).toBe(tunables.startingEnergy - tunables.jumpCost * 2);
    const climber = room.state.climbers.get(welcome.playerId)!;
    expect(climber).toMatchObject({ heightMetres: 0, summitsReached: 0, finished: false });
    expect(climber.correct).toBe(0);
    expect(room.state.phase).toBe('playing');
  }, 30_000);

  it('ranks by height when the host ends the game, and drops removed players from the ranking', async () => {
    const { room, host } = await createGame();
    const [climber, stander, leaver] = await Promise.all(
      ['Eli', 'Fay', 'Gus'].map((nickname) => joinPlayer(room, nickname)),
    );
    await startGame(room, host);
    const bot = await startBot(climber!);
    const idle = await startBot(stander!, 1_000);
    const gone = (await leaver!.request(clientRequestTypes.whoAmI)) as WelcomeMessage;
    host.send(hostMessageTypes.kick, { playerId: gone.playerId });
    for (let frame = 0; frame < 100; frame += 1) {
      await bot.play(0.1);
      await idle.play(0.1);
      fakeNowMs += 100;
      await sleep(1);
    }
    await sleep(100);
    host.send(hostMessageTypes.end, {});
    await waitFor(() => host.state.phase === 'ended', 'the end');
    await sleep(100);
    expect(room.state.endReason).toBe('hostEnded');
    expect(host.state.winnerId).toBe(bot.playerId);
    expect(host.state.climbers.has(gone.playerId)).toBe(false);
    expect(host.state.climbers.get(idle.playerId)?.rank).toBe(2);
    // Nothing moves after the end.
    const heightAtEnd = room.state.climbers.get(bot.playerId)!.heightMetres;
    await bot.play(1);
    await sleep(100);
    expect(room.state.climbers.get(bot.playerId)!.heightMetres).toBe(heightAtEnd);
  }, 30_000);

  it('asks the questions of the set the game was launched with', async () => {
    const launchedSet = {
      id: 'host-set',
      title: 'Capitals',
      questions: [
        {
          id: '0199c3f2-6a51-7c11-9a43-111111111111',
          type: 'trueFalse',
          prompt: 'Paris is the capital of France.',
          options: [
            { id: '0199c3f2-6a51-7c11-9a43-222222222222', text: 'True', isCorrect: true },
            { id: '0199c3f2-6a51-7c11-9a43-333333333333', text: 'False', isCorrect: false },
          ],
        },
      ],
    };
    const { room, host } = await createGame({}, { questionSet: launchedSet });
    const player = await joinPlayer(room, 'Dee');
    await startGame(room, host);
    const question = (await player.request(sessionRequestTypes.question)) as { prompt: string };
    expect(question.prompt).toBe('Paris is the capital of France.');
  });

  it("shares the host's checkpoints setting with every device", async () => {
    const off = await createGame();
    const on = await createGame({ checkpointsEnabled: true });
    await waitFor(() => on.host.state.summitCount > 0, 'state');
    await waitFor(() => off.host.state.summitCount > 0, 'state');
    expect(off.host.state.checkpointsEnabled).toBe(false);
    expect(on.host.state.checkpointsEnabled).toBe(true);
  });

  it('uses the platform defaults for message limits outside tests', () => {
    configureRoomServices({ maxMessagesPerSecond: 60 });
    expect(roomServices.maxMessagesPerSecond).toBe(60);
  });
});
