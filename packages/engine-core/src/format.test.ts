import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it('shows minutes, seconds and tenths under an hour', () => {
    expect(formatDuration(0)).toBe('0:00.0');
    expect(formatDuration(65.37)).toBe('1:05.3');
    expect(formatDuration(599.99)).toBe('9:59.9');
  });

  it('shows hours without tenths beyond an hour', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('treats bad input as zero', () => {
    expect(formatDuration(-4)).toBe('0:00.0');
    expect(formatDuration(Number.NaN)).toBe('0:00.0');
  });
});
