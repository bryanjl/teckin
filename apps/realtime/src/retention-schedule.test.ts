import { describe, expect, it } from 'vitest';
import { positiveIntegerFromEnvironment } from './retention-schedule';

describe('positiveIntegerFromEnvironment', () => {
  it('reads positive whole numbers and falls back otherwise', () => {
    expect(positiveIntegerFromEnvironment('6', 12)).toBe(6);
    expect(positiveIntegerFromEnvironment(undefined, 12)).toBe(12);
    expect(positiveIntegerFromEnvironment('', 12)).toBe(12);
    expect(positiveIntegerFromEnvironment('0', 12)).toBe(12);
    expect(positiveIntegerFromEnvironment('1.5', 12)).toBe(12);
    expect(positiveIntegerFromEnvironment('soon', 12)).toBe(12);
  });
});
