import { wrongAnswerLockMs } from '@teckin/game-contracts';
import { sampleQuestionSets, type QuestionSet } from '@teckin/questions';
import { describe, expect, it } from 'vitest';
import { QuestionSessions, type EnergyRules } from './question-sessions';

const rules: EnergyRules = {
  startingEnergy: 50,
  energyPerCorrectAnswer: 100,
  costOf: (reason) => ({ jump: 24, airJump: 30, walk: 2 })[reason],
};
const questionSet: QuestionSet = sampleQuestionSets.maths;

function correctOptionOf(questionId: string): string {
  const question = questionSet.questions.find((item) => item.id === questionId);
  return question!.options.find((option) => option.isCorrect)!.id;
}

function wrongOptionOf(questionId: string): string {
  const question = questionSet.questions.find((item) => item.id === questionId);
  return question!.options.find((option) => !option.isCorrect)!.id;
}

function createSessions() {
  let nowMs = 0;
  const sessions = new QuestionSessions(questionSet, rules, 'game-1', () => nowMs);
  return { sessions, advance: (ms: number) => (nowMs += ms) };
}

describe('QuestionSessions', () => {
  it('starts each player with the starting energy and adds energy only for correct answers', () => {
    const { sessions, advance } = createSessions();
    const player = sessions.forPlayer('p1');
    expect(player.state).toEqual({ energy: 50, spendSeq: 0, version: 0 });

    const first = player.question();
    const right = player.answer(first.id, correctOptionOf(first.id));
    expect(right.ok && right.outcome).toMatchObject({ isCorrect: true, energyGained: 100 });
    expect(player.energy).toBe(150);

    const second = player.question();
    const wrong = player.answer(second.id, wrongOptionOf(second.id));
    expect(wrong.ok && wrong.outcome).toMatchObject({ isCorrect: false, energyGained: 0 });
    expect(player.energy).toBe(150);
    advance(wrongAnswerLockMs);
    expect(player.answerTotals()).toEqual({ answered: 2, correct: 1 });
  });

  it('refuses forged answers: another question, a foreign option, or skipping the reveal', () => {
    const { sessions, advance } = createSessions();
    const player = sessions.forPlayer('p1');
    const current = player.question();
    const other = questionSet.questions.find((question) => question.id !== current.id)!;
    expect(player.answer(other.id, correctOptionOf(other.id))).toEqual({
      ok: false,
      reason: 'invalidAnswer',
    });
    expect(player.answer(current.id, 'not-an-option')).toEqual({
      ok: false,
      reason: 'invalidAnswer',
    });
    expect(player.energy).toBe(50);

    player.answer(current.id, wrongOptionOf(current.id));
    const next = player.question();
    expect(player.answer(next.id, correctOptionOf(next.id))).toEqual({
      ok: false,
      reason: 'tooSoon',
    });
    advance(wrongAnswerLockMs);
    expect(player.answer(next.id, correctOptionOf(next.id)).ok).toBe(true);
  });

  it('charges its own prices once per spend, refuses spends it cannot afford, and skips resent ones', () => {
    const { sessions } = createSessions();
    const player = sessions.forPlayer('p1');
    expect(player.applySpends(1, ['jump', 'walk', 'walk'])).toEqual([
      { seq: 1, reason: 'jump', cost: 24, paid: true },
      { seq: 2, reason: 'walk', cost: 2, paid: true },
      { seq: 3, reason: 'walk', cost: 2, paid: true },
    ]);
    expect(player.energy).toBe(22);
    // Resent after a reconnect: 2 and 3 were already applied.
    expect(player.applySpends(2, ['walk', 'walk', 'airJump'])).toEqual([
      { seq: 4, reason: 'airJump', cost: 30, paid: false },
    ]);
    expect(player.energy).toBe(22);
    expect(player.applySpends(5, ['teleport'])).toEqual([
      { seq: 5, reason: 'teleport', cost: 0, paid: true },
    ]);
    expect(player.state).toMatchObject({ energy: 22, spendSeq: 5 });
  });

  it('gives each player their own repeatable deck order', () => {
    const order = (gameSeed: string, playerId: string) => {
      const sessions = new QuestionSessions(questionSet, rules, gameSeed, () => 0);
      const player = sessions.forPlayer(playerId);
      const ids: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const question = player.question();
        ids.push(question.id);
        player.answer(question.id, correctOptionOf(question.id));
      }
      return ids;
    };
    expect(order('game', 'a')).toEqual(order('game', 'a'));
    expect(order('game', 'a')).not.toEqual(order('game', 'b'));
  });
});
