import { RedisPresence } from '@colyseus/redis-presence';
import { createJoinCodeRegistry } from '@teckin/room-core';
import { afterAll, describe, expect, it } from 'vitest';

const redisUrl = process.env.REDIS_URL;

// Runs when REDIS_URL points at a Redis server (CI starts one; locally use docker compose).
describe.runIf(redisUrl)('join codes on Redis presence', () => {
  const processA = new RedisPresence(redisUrl);
  const processB = new RedisPresence(redisUrl);

  afterAll(() => {
    processA.shutdown();
    processB.shutdown();
  });

  it('resolves a code claimed by one process from another, until it is released', async () => {
    const code = await createJoinCodeRegistry(processA).claim('room-on-a', 60);
    const registryB = createJoinCodeRegistry(processB);
    expect(await registryB.lookup(code)).toBe('room-on-a');
    await registryB.release(code);
    expect(await createJoinCodeRegistry(processA).lookup(code)).toBeNull();
  });
});
