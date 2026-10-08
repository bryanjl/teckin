import { hostMessageSchemas, hostMessageTypes, type RoomStateView } from '@teckin/game-contracts';
import { describe, expect, it } from 'vitest';
import {
  describeEndReason,
  describeHostRejection,
  displayJoinLink,
  formatJoinCode,
  hostCommandsFor,
  hostViewOf,
  joinLinkFor,
  sameHostView,
} from './host-view';

function state(extra: Partial<RoomStateView> = {}): RoomStateView {
  const players = new Map([
    ['p1', { id: 'p1', nickname: 'Zed', connected: true, removed: false }],
    ['p2', { id: 'p2', nickname: 'Ada', connected: false, removed: false }],
    ['p3', { id: 'p3', nickname: 'Gone', connected: false, removed: true }],
  ]);
  return {
    gameId: 'climber',
    joinCode: '482913',
    phase: 'lobby',
    locked: false,
    allowLateJoin: true,
    maxPlayers: 60,
    countdownRemainingMs: 0,
    remainingMs: 15 * 60_000,
    endReason: '',
    players,
    ...extra,
  };
}

describe('hostViewOf', () => {
  it('lists players still in the game by name, with who is away', () => {
    const view = hostViewOf(state());
    expect(view.players).toEqual([
      { id: 'p2', nickname: 'Ada', connected: false },
      { id: 'p1', nickname: 'Zed', connected: true },
    ]);
    expect(view.removedCount).toBe(1);
    expect(view.remainingSeconds).toBe(900);
    expect(view.countdownSeconds).toBe(0);
  });

  it('counts the countdown down in whole seconds and rounds play time up', () => {
    expect(
      hostViewOf(state({ phase: 'countdown', countdownRemainingMs: 2100 })).countdownSeconds,
    ).toBe(3);
    expect(
      hostViewOf(state({ phase: 'countdown', countdownRemainingMs: 0 })).countdownSeconds,
    ).toBe(1);
    expect(hostViewOf(state({ phase: 'playing', remainingMs: 59_001 })).remainingSeconds).toBe(60);
    expect(hostViewOf(state({ phase: 'ended', remainingMs: -5 })).remainingSeconds).toBe(0);
  });

  it('tells React when nothing visible changed', () => {
    const a = hostViewOf(state());
    expect(sameHostView(undefined, a)).toBe(false);
    expect(sameHostView(a, hostViewOf(state()))).toBe(true);
    expect(sameHostView(a, hostViewOf(state({ locked: true })))).toBe(false);
    expect(sameHostView(a, hostViewOf(state({ remainingMs: 899_000 })))).toBe(false);
    const renamed = state();
    (renamed.players as unknown as Map<string, { nickname: string }>).get('p1')!.nickname = 'Zoe';
    expect(sameHostView(a, hostViewOf(renamed))).toBe(false);
  });
});

describe('join code and link', () => {
  it('splits the code for reading and builds the join link', () => {
    expect(formatJoinCode('482913')).toBe('482 913');
    expect(formatJoinCode('12')).toBe('12');
    const link = joinLinkFor('http://192.168.1.20:3000', '482913');
    expect(link).toBe('http://192.168.1.20:3000/join?code=482913');
    expect(displayJoinLink(link)).toBe('192.168.1.20:3000/join?code=482913');
  });
});

describe('describeEndReason and describeHostRejection', () => {
  it('explains every end reason and refusal in words', () => {
    for (const reason of ['goalReached', 'timeUp', 'hostEnded', 'abandoned']) {
      expect(describeEndReason(reason)).not.toBe('');
    }
    expect(describeEndReason('')).toBe('');
    expect(describeHostRejection('nicknameTaken')).toContain('already has that name');
    expect(describeHostRejection('somethingNew')).toContain('Try again');
  });
});

describe('hostCommandsFor', () => {
  it('sends every host command in the shape the room accepts', () => {
    const sent: [string, unknown][] = [];
    const commands = hostCommandsFor({ send: (type, message) => sent.push([type, message]) });
    commands.start();
    commands.setLocked(true);
    commands.rename('p1', 'Zoe');
    commands.kick('p2');
    commands.allowKicked();
    commands.addTime(5);
    commands.end();
    expect(sent.map(([type]) => type)).toEqual([
      hostMessageTypes.start,
      hostMessageTypes.lock,
      hostMessageTypes.rename,
      hostMessageTypes.kick,
      hostMessageTypes.allowKicked,
      hostMessageTypes.addTime,
      hostMessageTypes.end,
    ]);
    for (const [type, message] of sent) {
      const schema = hostMessageSchemas[type as keyof typeof hostMessageSchemas];
      expect(schema.safeParse(message).success).toBe(true);
    }
  });
});
