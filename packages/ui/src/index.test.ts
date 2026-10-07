import { describe, expect, it } from 'vitest';
import { uiPackage } from './index';

describe('ui stub', () => {
  it('is wired into the workspace', () => {
    expect(uiPackage.name).toBe('ui');
  });
});
