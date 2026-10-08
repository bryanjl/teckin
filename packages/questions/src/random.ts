/** A source of random numbers in [0, 1), like `Math.random`. */
export type RandomSource = () => number;

/**
 * Small seeded generator (mulberry32). The same seed gives the same deck order, which makes
 * tests and bot playtests repeatable.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a shuffled copy of `items` (Fisher–Yates). */
export function shuffled<Item>(items: readonly Item[], random: RandomSource): Item[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = result[index] as Item;
    result[index] = result[swap] as Item;
    result[swap] = current;
  }
  return result;
}
