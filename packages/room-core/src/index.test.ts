import { describe, expect, it } from 'vitest';
import { roomCorePackage } from './index';

describe('room-core stub', () => {
  it('is wired into the workspace', () => {
    expect(roomCorePackage.name).toBe('room-core');
  });
});
