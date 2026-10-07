import { describe, expect, it } from 'vitest';
import { databasePackage } from './index';

describe('db stub', () => {
  it('is wired into the workspace', () => {
    expect(databasePackage.name).toBe('db');
  });
});
