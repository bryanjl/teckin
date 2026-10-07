import { describe, expect, it } from 'vitest';
import { engineCorePackage } from './index';

describe('engine-core stub', () => {
  it('is wired into the workspace', () => {
    expect(engineCorePackage.name).toBe('engine-core');
  });
});
