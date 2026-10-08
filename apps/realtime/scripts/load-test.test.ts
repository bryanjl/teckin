import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const realtimeFolder = fileURLToPath(new URL('..', import.meta.url));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

// A small run keeps the load-test harness working; the full 60-bot and 10 × 30 runs are
// recorded in docs/load-test.md (they take minutes and want a quiet machine).
describe('load test harness', () => {
  it('plays bots in a real server process and reports room tick time, CPU and memory', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'teckin-load-'));
    const output = join(folder, 'results.json');
    try {
      await run(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/load-test.ts',
          '--rooms',
          '2',
          '--bots',
          '6',
          '--warmup',
          '1',
          '--seconds',
          '3',
          '--port',
          String(await freePort()),
          '--json',
          output,
        ],
        { cwd: realtimeFolder, timeout: 90_000 },
      );
      const [result] = JSON.parse(await readFile(output, 'utf8')) as [
        {
          rooms: number;
          botsPerRoom: number;
          corrections: number;
          reportsPerBotPerSecond: number;
          server: {
            rooms: number;
            clients: number;
            roomWork: { windows: number; p99Ms: number };
            memoryMegabytes: { rss: number };
          };
        },
      ];
      expect(result.server.rooms).toBe(2);
      expect(result.server.clients).toBe(14);
      expect(result.server.roomWork.windows).toBeGreaterThan(50);
      expect(result.server.roomWork.p99Ms).toBeLessThan(20);
      expect(result.server.memoryMegabytes.rss).toBeGreaterThan(0);
      expect(result.reportsPerBotPerSecond).toBeGreaterThan(5);
      // Honest bots are never snapped back.
      expect(result.corrections).toBe(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }, 120_000);
});
