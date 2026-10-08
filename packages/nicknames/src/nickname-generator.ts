import { maxNicknameLength } from './nickname-check';

/** Friendly describing words for generated names. */
export const nicknameAdjectives = [
  'Brave',
  'Bright',
  'Bouncy',
  'Brisk',
  'Busy',
  'Calm',
  'Cheery',
  'Clever',
  'Cosy',
  'Daring',
  'Dizzy',
  'Eager',
  'Fizzy',
  'Fluffy',
  'Gentle',
  'Giddy',
  'Golden',
  'Happy',
  'Jolly',
  'Keen',
  'Kind',
  'Lively',
  'Lucky',
  'Mighty',
  'Misty',
  'Nimble',
  'Peppy',
  'Plucky',
  'Quick',
  'Quiet',
  'Rapid',
  'Rosy',
  'Shiny',
  'Snappy',
  'Speedy',
  'Sunny',
  'Swift',
  'Tidy',
  'Witty',
  'Zesty',
] as const;

/** Animals and small things for generated names. */
export const nicknameNouns = [
  'Badger',
  'Beetle',
  'Comet',
  'Cricket',
  'Dolphin',
  'Falcon',
  'Ferret',
  'Gecko',
  'Heron',
  'Koala',
  'Lemur',
  'Llama',
  'Lynx',
  'Marmot',
  'Meerkat',
  'Moose',
  'Narwhal',
  'Newt',
  'Otter',
  'Owl',
  'Panda',
  'Parrot',
  'Pebble',
  'Penguin',
  'Puffin',
  'Quokka',
  'Rabbit',
  'Robin',
  'Rocket',
  'Seal',
  'Sparrow',
  'Squid',
  'Tiger',
  'Toucan',
  'Turtle',
  'Walrus',
  'Wombat',
  'Yak',
  'Zebra',
  'Sprocket',
] as const;

/** A source of numbers in `[0, 1)`, like `Math.random`. Tests pass a fixed one. */
export type RandomSource = () => number;

function pick<T>(items: readonly T[], random: RandomSource): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index] as T;
}

/**
 * Makes a safe random nickname such as "Plucky Otter". Every combination is at most
 * {@link maxNicknameLength} characters and passes the nickname check (a test proves both).
 * Names in `avoid` (compared without case) are skipped when another is available, so
 * tapping "Random name" twice gives a new name and a room's taken names can be dodged.
 */
export function generateNickname(
  random: RandomSource = Math.random,
  avoid: Iterable<string> = [],
): string {
  const avoided = new Set([...avoid].map((name) => name.toLocaleLowerCase()));
  let name = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    name = `${pick(nicknameAdjectives, random)} ${pick(nicknameNouns, random)}`;
    if (name.length <= maxNicknameLength && !avoided.has(name.toLocaleLowerCase())) return name;
  }
  return name;
}
