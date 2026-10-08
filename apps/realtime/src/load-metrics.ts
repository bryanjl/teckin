import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createEndpoint, matchMaker } from '@colyseus/core';
import type { RoomWorkStats, RoomWorkSummary } from '@teckin/room-core';

/** What `GET /metrics/load` returns: this process since the last reset. */
export interface LoadMetricsReport {
  /** Seconds since the last reset. */
  seconds: number;
  /** Rooms and connected clients on this process now. */
  rooms: number;
  clients: number;
  /** Per-room work for each state patch (the room's "tick"). */
  roomWork: RoomWorkSummary;
  /** Process CPU time over the period, as a percentage of one core. */
  cpuPercentOfOneCore: number;
  memoryMegabytes: { rss: number; heapUsed: number };
  /** How late a 10 ms timer ran (beyond its 10 ms): the whole process's responsiveness. */
  eventLoopDelayMs: { p50: number; p99: number; max: number };
}

const megabytes = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const nanosToMs = (nanos: number) => Math.round((nanos / 1e6) * 100) / 100;

/**
 * The load test's view into the server: room work percentiles, CPU, memory and event-loop
 * delay since the last reset. `GET /metrics/load?reset=1` reports and starts a new period.
 * Only registered when the server is started with load metrics on.
 */
export function createLoadMetrics(workStats: RoomWorkStats) {
  const resolutionMs = 10;
  const eventLoop = monitorEventLoopDelay({ resolution: resolutionMs });
  // The histogram records whole timer intervals; the lag is what exceeds the resolution.
  const lagMs = (nanos: number) =>
    Math.max(0, Math.round((nanosToMs(nanos) - resolutionMs) * 100) / 100);
  eventLoop.enable();
  let periodStartedAt = performance.now();
  let cpuAtStart = process.cpuUsage();

  return createEndpoint('/metrics/load', { method: 'GET' }, async (ctx) => {
    const seconds = (performance.now() - periodStartedAt) / 1000;
    const cpu = process.cpuUsage(cpuAtStart);
    const memory = process.memoryUsage();
    const localRooms = await matchMaker.query({ processId: matchMaker.processId });
    const report: LoadMetricsReport = {
      seconds: Math.round(seconds * 10) / 10,
      rooms: localRooms.length,
      clients: localRooms.reduce((sum, room) => sum + room.clients, 0),
      roomWork: roundSummary(workStats.summary()),
      cpuPercentOfOneCore:
        seconds > 0 ? Math.round(((cpu.user + cpu.system) / 1e6 / seconds) * 1000) / 10 : 0,
      memoryMegabytes: { rss: megabytes(memory.rss), heapUsed: megabytes(memory.heapUsed) },
      eventLoopDelayMs: {
        p50: lagMs(eventLoop.percentile(50)),
        p99: lagMs(eventLoop.percentile(99)),
        max: lagMs(eventLoop.max),
      },
    };
    if (new URL(ctx.request?.url ?? '/', 'http://localhost').searchParams.has('reset')) {
      workStats.reset();
      eventLoop.reset();
      periodStartedAt = performance.now();
      cpuAtStart = process.cpuUsage();
    }
    return Response.json(report);
  });
}

function roundSummary(summary: RoomWorkSummary): RoomWorkSummary {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    ...summary,
    meanMs: round(summary.meanMs),
    p50Ms: round(summary.p50Ms),
    p95Ms: round(summary.p95Ms),
    p99Ms: round(summary.p99Ms),
    maxMs: round(summary.maxMs),
  };
}
