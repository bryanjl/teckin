import { describe, expect, it } from 'vitest';
import { questionsPackage } from './index';

describe('questions stub', () => {
  it('is wired into the workspace', () => {
    expect(questionsPackage.name).toBe('questions');
  });
});
