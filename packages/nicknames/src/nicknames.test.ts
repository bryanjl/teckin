import { describe, expect, it } from 'vitest';
import {
  checkNickname,
  describeNicknameProblem,
  generateNickname,
  maxNicknameLength,
  nicknameAdjectives,
  nicknameNouns,
  reviewNickname,
  type NicknameProblem,
} from './index';

describe('reviewNickname', () => {
  it('accepts ordinary names and cleans spacing', () => {
    expect(reviewNickname('  Sam   B ')).toEqual({ ok: true, nickname: 'Sam B' });
    expect(checkNickname("Zoë O'Neil")).toBe("Zoë O'Neil");
    expect(checkNickname('Mia-2')).toBe('Mia-2');
  });

  it.each<[string, NicknameProblem]>([
    ['   ', 'empty'],
    ['A'.repeat(maxNicknameLength + 1), 'tooLong'],
    ['<script>', 'characters'],
    ['-Dash', 'characters'],
    ['me@example', 'characters'],
    ['07700 900123', 'tooManyDigits'],
    ['Kid 12345', 'tooManyDigits'],
  ])('refuses %j (%s)', (nickname, problem) => {
    expect(reviewNickname(nickname)).toEqual({ ok: false, problem });
  });

  it.each(['fuck', 'F U C K', 'sh1t', 'Shiiiit', 'fuuuck you', 'bitch', 'B1tch Face', 'Sh-it'])(
    'filters profanity, including disguised spellings: %j',
    (nickname) => {
      expect(reviewNickname(nickname)).toEqual({ ok: false, problem: 'notAllowed' });
    },
  );

  it.each([
    'Scunthorpe',
    'Cassie',
    'Shitake',
    'Dickens',
    'Grass',
    'Hancock',
    'Assam',
    'Pass Word',
    'Glass Hat',
  ])('does not catch innocent names: %j', (nickname) => {
    expect(checkNickname(nickname)).toBe(nickname);
  });

  it('explains every problem', () => {
    const problems: NicknameProblem[] = [
      'empty',
      'tooLong',
      'characters',
      'tooManyDigits',
      'notAllowed',
    ];
    for (const problem of problems) {
      expect(describeNicknameProblem(problem).length).toBeGreaterThan(5);
    }
  });
});

describe('generateNickname', () => {
  it('only ever makes names that fit and pass the check', () => {
    for (const adjective of nicknameAdjectives) {
      for (const noun of nicknameNouns) {
        const name = `${adjective} ${noun}`;
        expect(name.length, name).toBeLessThanOrEqual(maxNicknameLength);
        expect(checkNickname(name), name).toBe(name);
      }
    }
  });

  it('is driven by the random source', () => {
    expect(generateNickname(() => 0)).toBe(`${nicknameAdjectives[0]} ${nicknameNouns[0]}`);
    expect(generateNickname(() => 0.9999)).toBe(
      `${nicknameAdjectives.at(-1)} ${nicknameNouns.at(-1)}`,
    );
  });

  it('skips names to avoid when it can', () => {
    const values = [0, 0, 0.5, 0.5];
    let index = 0;
    const random = () => values[index++ % values.length]!;
    const first = `${nicknameAdjectives[0]} ${nicknameNouns[0]}`;
    expect(generateNickname(random, [first.toUpperCase()])).not.toBe(first);
  });
});
