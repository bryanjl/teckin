import { describe, expect, it } from 'vitest';
import { platformerKitPackage } from './index';

describe('platformer-kit stub', () => {
  it('is wired into the workspace', () => {
    expect(platformerKitPackage.name).toBe('platformer-kit');
  });
});
