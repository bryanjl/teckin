import { LocalPresence } from '@colyseus/core';
import { describe, expect, it } from 'vitest';
import { createJoinCodeRegistry, randomJoinCode } from './join-codes';
import { InMemorySessionRecorder } from './session-recorder';

/** A random source that replays the given values, then repeats the last one. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe('randomJoinCode', () => {
  it('always gives 6 digits without a leading zero', () => {
    expect(randomJoinCode(() => 0)).toBe('100000');
    expect(randomJoinCode(() => 0.999_999_9)).toBe('999999');
  });
});

describe('createJoinCodeRegistry', () => {
  it('claims, looks up and releases a code', async () => {
    const registry = createJoinCodeRegistry(new LocalPresence(), sequence(0.5));
    const code = await registry.claim('room-1', 60);
    expect(code).toBe('550000');
    expect(await registry.lookup(code)).toBe('room-1');
    await registry.release(code);
    expect(await registry.lookup(code)).toBeNull();
  });

  it('never hands out a code that an active game holds', async () => {
    const presence = new LocalPresence();
    const registry = createJoinCodeRegistry(presence, sequence(0.5, 0.5, 0.25));
    expect(await registry.claim('room-1', 60)).toBe('550000');
    expect(await registry.claim('room-2', 60)).toBe('325000');
    expect(await registry.lookup('550000')).toBe('room-1');
  });

  it('gives up after many collisions instead of looping forever', async () => {
    const registry = createJoinCodeRegistry(new LocalPresence(), () => 0.5);
    await registry.claim('room-1', 60);
    await expect(registry.claim('room-2', 60)).rejects.toThrow('free join code');
  });

  it('treats anything that is not 6 digits as unknown', async () => {
    const registry = createJoinCodeRegistry(new LocalPresence());
    expect(await registry.lookup('12345')).toBeNull();
    expect(await registry.lookup('abc123')).toBeNull();
    expect(await registry.lookup('*')).toBeNull();
  });
});

describe('InMemorySessionRecorder', () => {
  it('keeps events per session and clears one session', () => {
    const recorder = new InMemorySessionRecorder();
    recorder.record({ type: 'sessionStarted', sessionId: 'a', gameId: 'g', atMs: 1 });
    recorder.record({ type: 'sessionStarted', sessionId: 'b', gameId: 'g', atMs: 2 });
    expect(recorder.events('a')).toHaveLength(1);
    recorder.clear('a');
    expect(recorder.events().map((event) => event.sessionId)).toEqual(['b']);
  });
});
