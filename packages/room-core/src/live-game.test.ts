import { describe, expect, it } from 'vitest';
import { platformNicknameCheck, LiveGame } from './live-game';

function join(
  game: LiveGame,
  playerId: string,
  nickname = playerId,
  deviceKeyHash = `device-${playerId}`,
) {
  return game.admitPlayer({ playerId, nickname, deviceKeyHash, nowMs: 0 });
}

describe('platformNicknameCheck', () => {
  it('trims and collapses spaces', () => {
    expect(platformNicknameCheck('  Blue   Fox ')).toBe('Blue Fox');
  });

  it('accepts letters from any language, digits, hyphens and apostrophes', () => {
    expect(platformNicknameCheck('Zoë-2')).toBe('Zoë-2');
    expect(platformNicknameCheck("O'Neil")).toBe("O'Neil");
  });

  it('rejects empty, long and symbol names', () => {
    expect(platformNicknameCheck('   ')).toBeNull();
    expect(platformNicknameCheck('x'.repeat(17))).toBeNull();
    expect(platformNicknameCheck('<b>hi</b>')).toBeNull();
    expect(platformNicknameCheck('-dash')).toBeNull();
  });

  it('runs the profanity filter by default', () => {
    const game = new LiveGame();
    expect(join(game, 'a', 'Sh1t Head')).toEqual({ ok: false, reason: 'nicknameInvalid' });
  });
});

describe('LiveGame roster', () => {
  it('admits players up to the cap', () => {
    const game = new LiveGame({ maxPlayers: 2 });
    expect(join(game, 'a').ok).toBe(true);
    expect(join(game, 'b').ok).toBe(true);
    expect(join(game, 'c')).toEqual({ ok: false, reason: 'roomFull' });
  });

  it('keeps nicknames unique regardless of case', () => {
    const game = new LiveGame();
    join(game, 'a', 'Robo');
    expect(join(game, 'b', 'ROBO')).toEqual({ ok: false, reason: 'nicknameTaken' });
  });

  it('refuses joins while locked', () => {
    const game = new LiveGame();
    game.setLocked(true);
    expect(join(game, 'a')).toEqual({ ok: false, reason: 'locked' });
    game.setLocked(false);
    expect(join(game, 'a').ok).toBe(true);
  });

  it('blocks a kicked device until the host allows kicked devices back', () => {
    const game = new LiveGame();
    join(game, 'a', 'Robo', 'device-1');
    expect(game.kickPlayer('a', 5)?.removedAtMs).toBe(5);
    expect(game.activePlayers).toHaveLength(0);
    expect(join(game, 'b', 'Other', 'device-1')).toEqual({ ok: false, reason: 'kicked' });
    game.allowKickedDevices();
    expect(join(game, 'b', 'Robo', 'device-1').ok).toBe(true);
    expect(game.allPlayers).toHaveLength(2);
  });

  it('frees a kicked player’s place under the cap', () => {
    const game = new LiveGame({ maxPlayers: 1 });
    join(game, 'a');
    game.kickPlayer('a', 0);
    expect(join(game, 'b').ok).toBe(true);
  });

  it('renames with the same checks as joining', () => {
    const game = new LiveGame();
    join(game, 'a', 'Robo');
    join(game, 'b', 'Gear');
    expect(game.renamePlayer('a', 'gear')).toBe('nicknameTaken');
    expect(game.renamePlayer('a', '!!')).toBe('nicknameInvalid');
    expect(game.renamePlayer('zzz', 'Fine')).toBe('unknownPlayer');
    expect(game.renamePlayer('a', ' Bolt ')).toBeNull();
    expect(game.player('a')?.nickname).toBe('Bolt');
  });

  it('uses a custom nickname check', () => {
    const game = new LiveGame({}, (nickname) => (nickname.includes('bad') ? null : nickname));
    expect(join(game, 'a', 'badword')).toEqual({ ok: false, reason: 'nicknameInvalid' });
  });
});

describe('LiveGame lifecycle', () => {
  it('counts down, plays for the duration, then ends on time', () => {
    const game = new LiveGame({ durationMs: 10_000, countdownMs: 3_000 });
    expect(game.startCountdown(100)).toEqual({ type: 'countdownStarted', endsAtMs: 3_100 });
    expect(game.tick(3_000)).toEqual([]);
    expect(game.tick(3_100)).toEqual([{ type: 'started', startedAtMs: 3_100, endsAtMs: 13_100 }]);
    expect(game.remainingMs(8_100)).toBe(5_000);
    expect(game.tick(20_000)).toEqual([{ type: 'ended', reason: 'timeUp', endedAtMs: 13_100 }]);
    expect(game.phase).toBe('ended');
    expect(game.remainingMs(30_000)).toBe(0);
  });

  it('jumps straight to ended when a single tick passes both deadlines', () => {
    const game = new LiveGame({ durationMs: 1_000, countdownMs: 1_000 });
    game.startCountdown(0);
    expect(game.tick(5_000).map((event) => event.type)).toEqual(['started', 'ended']);
  });

  it('only starts from the lobby and only ends once', () => {
    const game = new LiveGame();
    game.startCountdown(0);
    expect(game.startCountdown(1)).toBeNull();
    expect(game.end('hostEnded', 2)).toEqual({ type: 'ended', reason: 'hostEnded', endedAtMs: 2 });
    expect(game.end('timeUp', 3)).toBeNull();
    expect(game.endReason).toBe('hostEnded');
  });

  it('adds time only while playing and never beyond the longest game', () => {
    const game = new LiveGame({
      durationMs: 50 * 60_000,
      maxDurationMs: 60 * 60_000,
      countdownMs: 0,
    });
    expect(game.addTime(60_000)).toBeNull();
    game.startCountdown(0);
    game.tick(0);
    expect(game.addTime(5 * 60_000)).toBe(55 * 60_000);
    expect(game.addTime(30 * 60_000)).toBe(60 * 60_000);
  });

  it('allows late joins by default and refuses them when turned off', () => {
    const open = new LiveGame({ countdownMs: 0 });
    open.startCountdown(0);
    open.tick(0);
    expect(join(open, 'late').ok).toBe(true);

    const closed = new LiveGame({ allowLateJoin: false });
    closed.startCountdown(0);
    expect(join(closed, 'late')).toEqual({ ok: false, reason: 'lateJoinClosed' });
  });

  it('refuses every join once ended', () => {
    const game = new LiveGame();
    game.end('hostEnded', 0);
    expect(join(game, 'a')).toEqual({ ok: false, reason: 'gameEnded' });
  });
});
