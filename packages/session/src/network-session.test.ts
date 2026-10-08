import {
  sessionMessageTypes,
  sessionRequestTypes,
  type AnswerReply,
  type EnergyState,
  type SpendBatch,
} from '@teckin/game-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkSession, type RoomConnection } from './network-session';

/** A fake room: records what is sent and lets the test answer requests and push messages. */
function createFakeRoom(initial: EnergyState) {
  const sent: { type: string; payload: unknown }[] = [];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const replies = new Map<string, (payload: unknown) => unknown>();
  replies.set(sessionRequestTypes.energy, () => initial);
  const connection: RoomConnection = {
    send: (type, payload) => sent.push({ type, payload }),
    request: async (type, payload) => {
      const reply = replies.get(type);
      if (!reply) throw new Error(`no reply for ${type}`);
      return reply(payload);
    },
    onMessage: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
      return () => set.delete(listener);
    },
  };
  return {
    connection,
    sent,
    replies,
    push: (type: string, payload: unknown) =>
      listeners.get(type)?.forEach((listener) => listener(payload)),
    spendBatches: () =>
      sent
        .filter((item) => item.type === sessionMessageTypes.spend)
        .map((item) => item.payload as SpendBatch),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('NetworkSession', () => {
  it('starts from the server energy and numbers spends after those already applied', async () => {
    const room = createFakeRoom({ energy: 80, spendSeq: 7, version: 3 });
    const session = await NetworkSession.connect(room.connection, 'player-1');
    expect(session.energy).toBe(80);
    expect(session.spendEnergy(24, 'jump')).toBe(true);
    expect(session.spendEnergy(2, 'walk')).toBe(true);
    expect(session.energy).toBe(54);
    expect(room.spendBatches()).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(room.spendBatches()).toEqual([{ firstSeq: 8, reasons: ['jump', 'walk'] }]);
  });

  it('refuses a spend it cannot afford without sending anything', async () => {
    const room = createFakeRoom({ energy: 20, spendSeq: 0, version: 0 });
    const session = await NetworkSession.connect(room.connection, 'player-1');
    expect(session.spendEnergy(24, 'jump')).toBe(false);
    expect(session.energy).toBe(20);
    session.flush();
    expect(room.spendBatches()).toEqual([]);
  });

  it('sends waiting spends before any game message, so the room sees payment before movement', async () => {
    const room = createFakeRoom({ energy: 100, spendSeq: 0, version: 0 });
    const session = await NetworkSession.connect(room.connection, 'player-1');
    session.spendEnergy(24, 'jump');
    session.realtime.send('climber:move', { seq: 1 });
    expect(room.sent.map((item) => item.type)).toEqual([sessionMessageTypes.spend, 'climber:move']);
  });

  it('reconciles with the server: applied spends drop out, unpaid ones are given back', async () => {
    const room = createFakeRoom({ energy: 50, spendSeq: 0, version: 0 });
    const session = await NetworkSession.connect(room.connection, 'player-1');
    const changes: number[] = [];
    session.onEnergyChange((change) => changes.push(change.energy));
    session.spendEnergy(24, 'jump'); // seq 1
    session.spendEnergy(24, 'jump'); // seq 2
    session.flush();
    session.spendEnergy(2, 'walk'); // seq 3, not yet applied
    expect(session.energy).toBe(0);
    // The server applied both jumps but could only afford the first: energy 26, applied to 2.
    room.push(sessionMessageTypes.energyChanged, { energy: 26, spendSeq: 2, version: 2 });
    expect(session.energy).toBe(24);
    expect(session.unconfirmedSpends).toBe(1);
    // A stale state is ignored.
    room.push(sessionMessageTypes.energyChanged, { energy: 50, spendSeq: 0, version: 1 });
    expect(session.energy).toBe(24);
    expect(changes).toEqual([26, 2, 0, 24]);
  });

  it('answers through the server and builds the answer summary from its replies', async () => {
    const room = createFakeRoom({ energy: 0, spendSeq: 0, version: 0 });
    const session = await NetworkSession.connect(room.connection, 'player-1');
    room.replies.set(sessionRequestTypes.question, () => ({
      id: 'q1',
      type: 'multipleChoice',
      prompt: '2 + 2?',
      options: [
        { id: 'a', text: '4' },
        { id: 'b', text: '5' },
      ],
    }));
    const reply = (correct: boolean, energy: number, version: number): AnswerReply => ({
      outcome: {
        questionId: 'q1',
        chosenOptionId: correct ? 'a' : 'b',
        isCorrect: correct,
        correctOptionId: 'a',
        correctAnswerText: '4',
        energyGained: correct ? 100 : 0,
        energy,
      },
      energyState: { energy, spendSeq: 0, version },
    });
    const question = await session.currentQuestion();
    room.replies.set(sessionRequestTypes.answer, () => reply(false, 0, 0));
    expect((await session.submitAnswer(question.id, 'b')).isCorrect).toBe(false);
    room.replies.set(sessionRequestTypes.answer, () => reply(true, 100, 1));
    const outcome = await session.submitAnswer(question.id, 'a');
    expect(outcome).toMatchObject({ isCorrect: true, energy: 100 });
    expect(session.energy).toBe(100);
    expect(session.answerSummary()).toEqual({
      answered: 2,
      correct: 1,
      accuracy: 0.5,
      missed: [{ questionId: 'q1', prompt: '2 + 2?', correctAnswer: '4', timesMissed: 1 }],
    });
  });

  it('resends spends the server never applied after a reconnect', async () => {
    const room = createFakeRoom({ energy: 100, spendSeq: 0, version: 0 });
    const session = await NetworkSession.connect(room.connection, 'player-1');
    session.spendEnergy(24, 'jump');
    session.spendEnergy(2, 'walk');
    session.flush(); // lost with the old connection
    room.replies.set(sessionRequestTypes.energy, () => ({ energy: 76, spendSeq: 1, version: 1 }));
    await session.resync();
    expect(room.spendBatches()).toEqual([
      { firstSeq: 1, reasons: ['jump', 'walk'] },
      { firstSeq: 2, reasons: ['walk'] },
    ]);
    expect(session.energy).toBe(74);
  });

  it('is never restarted from the device and exposes the player id', async () => {
    const room = createFakeRoom({ energy: 10, spendSeq: 0, version: 0 });
    const session = await NetworkSession.connect(room.connection, 'player-1');
    session.reset();
    expect(session.energy).toBe(10);
    expect(session.realtime.playerId).toBe('player-1');
  });
});
