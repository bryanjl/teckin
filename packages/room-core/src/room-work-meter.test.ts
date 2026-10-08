import { describe, expect, it } from 'vitest';
import { RoomWorkStats } from './room-work-meter';

describe('RoomWorkStats', () => {
  it('summarises patch windows as percentiles and forgets the oldest past its capacity', () => {
    const stats = new RoomWorkStats(100);
    for (let value = 1; value <= 120; value += 1) {
      stats.recordPatchWindow(value % 2 === 0 ? 'a' : 'b', value, value % 7);
    }
    const summary = stats.summary();
    expect(summary.windows).toBe(100);
    expect(summary.maxMs).toBe(120);
    expect(summary.p50Ms).toBe(71);
    expect(summary.p99Ms).toBe(120);
    expect(summary.meanMs).toBeCloseTo(70.5);
    expect(summary.rooms).toBe(2);
    expect(summary.mostClientsInARoom).toBe(6);
  });

  it('summarises nothing as zeros', () => {
    expect(new RoomWorkStats().summary()).toMatchObject({ windows: 0, maxMs: 0, p99Ms: 0 });
  });
});
