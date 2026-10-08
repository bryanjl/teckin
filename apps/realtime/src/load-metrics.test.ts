import { randomUUID } from 'node:crypto';
import type { ColyseusTestServer } from '@colyseus/testing';
import { bootTestServer } from '@teckin/room-core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LoadMetricsReport } from './load-metrics';
import { createRealtimeServer } from './server';
import { launchTestGameOrThrow } from './test-launch';

const sharedSecret = 'realtime-shared-secret-load-metrics-0123456789';

describe('load metrics route', () => {
  let colyseus: ColyseusTestServer;
  let baseUrl = '';

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeAll(async () => {
    const { gameServer } = createRealtimeServer({ sharedSecret, loadMetrics: true });
    ({ colyseus, baseUrl } = await bootTestServer(gameServer));
  });

  it('reports room work, CPU and memory, and starts a new period on reset', async () => {
    const launched = await launchTestGameOrThrow(baseUrl, sharedSecret);
    const player = await colyseus.sdk.joinById(launched.roomId, {
      role: 'player',
      nickname: 'Ada',
      deviceKey: randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const report = (await (
      await fetch(`${baseUrl}/metrics/load?reset=1`)
    ).json()) as LoadMetricsReport;
    expect(report.rooms).toBe(1);
    expect(report.clients).toBe(1);
    expect(report.roomWork.windows).toBeGreaterThan(0);
    expect(report.roomWork.mostClientsInARoom).toBe(1);
    expect(report.memoryMegabytes.rss).toBeGreaterThan(10);
    expect(report.cpuPercentOfOneCore).toBeGreaterThan(0);

    const next = (await (await fetch(`${baseUrl}/metrics/load`)).json()) as LoadMetricsReport;
    expect(next.seconds).toBeLessThan(report.seconds);
    await player.leave();
  });

  it('is not served unless switched on', async () => {
    const { gameServer } = createRealtimeServer({ sharedSecret });
    const routes = Object.keys(gameServer.router.endpoints);
    expect(routes).toContain('health');
    expect(routes).not.toContain('loadMetrics');
  });
});
