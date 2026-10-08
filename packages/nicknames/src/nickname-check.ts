import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

/** Longest nickname, in characters. Short enough to label a climber on a small phone. */
export const maxNicknameLength = 16;

/**
 * Most digits a nickname may hold. Players are often children, so a nickname must never be
 * able to carry a phone number, house number and postcode, or a birthday.
 */
export const maxNicknameDigits = 4;

/** Why a nickname was refused, so the join form can say what to change. */
export type NicknameProblem = 'empty' | 'tooLong' | 'characters' | 'tooManyDigits' | 'notAllowed';

/** Result of {@link reviewNickname}. */
export type NicknameReview =
  { ok: true; nickname: string } | { ok: false; problem: NicknameProblem };

const allowedCharacters = /^[\p{L}\p{N}][\p{L}\p{N} '-]*$/u;

let matcher: RegExpMatcher | undefined;

/** Built on first use, so pages that never check a name never pay for the word list. */
function profanityMatcher(): RegExpMatcher {
  matcher ??= new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
  });
  return matcher;
}

/** Trims, joins runs of spaces and normalises Unicode, the form every check sees. */
export function cleanNickname(nickname: string): string {
  return nickname.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * Checks a nickname against the platform's rules and says what is wrong with it:
 * 1 to {@link maxNicknameLength} letters, digits, spaces, hyphens and apostrophes, starting
 * with a letter or digit, no more than {@link maxNicknameDigits} digits, and nothing the
 * profanity filter catches (it sees through spacing, repeated letters and look-alike
 * characters such as `5` for `s`).
 */
export function reviewNickname(nickname: string): NicknameReview {
  const cleaned = cleanNickname(nickname);
  if (cleaned.length === 0) return { ok: false, problem: 'empty' };
  if (cleaned.length > maxNicknameLength) return { ok: false, problem: 'tooLong' };
  if (!allowedCharacters.test(cleaned)) return { ok: false, problem: 'characters' };
  if ((cleaned.match(/\p{N}/gu)?.length ?? 0) > maxNicknameDigits) {
    return { ok: false, problem: 'tooManyDigits' };
  }
  // Also check with the gaps closed up, so "F U C K" or "Sh-it" cannot slip through.
  const compact = cleaned.replace(/[ '-]/g, '');
  if (profanityMatcher().hasMatch(cleaned) || profanityMatcher().hasMatch(compact)) {
    return { ok: false, problem: 'notAllowed' };
  }
  return { ok: true, nickname: cleaned };
}

/**
 * The platform's nickname check in the shape rooms use: the cleaned nickname when it may be
 * used, otherwise `null`.
 */
export function checkNickname(nickname: string): string | null {
  const review = reviewNickname(nickname);
  return review.ok ? review.nickname : null;
}

/** A short, child-friendly explanation of a {@link NicknameProblem} for the join form. */
export function describeNicknameProblem(problem: NicknameProblem): string {
  switch (problem) {
    case 'empty':
      return 'Type a nickname or tap "Random name".';
    case 'tooLong':
      return `Use ${maxNicknameLength} letters or fewer.`;
    case 'characters':
      return 'Use letters, numbers, spaces, hyphens and apostrophes only.';
    case 'tooManyDigits':
      return `Use no more than ${maxNicknameDigits} numbers.`;
    case 'notAllowed':
      return 'Please choose a different nickname.';
  }
}
