import { createServer } from 'node:net';
import type { Server } from '@colyseus/core';
import { ColyseusTestServer } from '@colyseus/testing';

/** Finds a free local TCP port. */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts a Colyseus server on a free port and wraps it in the Colyseus test helpers.
 * `@colyseus/testing`'s own `boot` always uses port 2568, which collides when Turborepo runs
 * several packages' tests at once. For tests only.
 */
export async function bootTestServer(
  server: Server,
): Promise<{ colyseus: ColyseusTestServer; baseUrl: string }> {
  const port = await findFreePort();
  await server.listen(port, '127.0.0.1');
  return { colyseus: new ColyseusTestServer(server), baseUrl: `http://127.0.0.1:${port}` };
}
