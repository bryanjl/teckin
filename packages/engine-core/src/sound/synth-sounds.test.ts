import { describe, expect, it, vi } from 'vitest';
import { createSynthSoundPlayer, synthSoundNames } from './synth-sounds';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

function fakeAudioContext() {
  const started: number[] = [];
  const param = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => undefined),
    createOscillator: () => ({
      type: 'sine',
      frequency: param(),
      connect: (node: unknown) => node,
      start: (at: number) => started.push(at),
      stop: vi.fn(),
    }),
    createGain: () => ({ gain: param(), connect: (node: unknown) => node }),
  };
  return { context: context as unknown as AudioContext, started };
}

describe('createSynthSoundPlayer', () => {
  it('plays every sound as synthesised tones', () => {
    const { context, started } = fakeAudioContext();
    const player = createSynthSoundPlayer({ storage: null, createContext: () => context });
    for (const name of synthSoundNames) player.play(name);
    expect(started.length).toBeGreaterThanOrEqual(synthSoundNames.length);
  });

  it('stays silent while muted and remembers the choice', () => {
    const storage = memoryStorage();
    const { context, started } = fakeAudioContext();
    const player = createSynthSoundPlayer({ storage, createContext: () => context });
    const changes: boolean[] = [];
    player.onMutedChange((muted) => changes.push(muted));
    player.setMuted(true);
    player.play('jump');
    expect(started).toEqual([]);
    expect(storage.data.get('teckin.muted')).toBe('1');
    expect(changes).toEqual([true]);
    expect(createSynthSoundPlayer({ storage }).muted).toBe(true);
  });

  it('never throws when audio or storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const player = createSynthSoundPlayer({
      storage: broken,
      createContext: () => {
        throw new Error('no audio');
      },
    });
    expect(player.muted).toBe(false);
    expect(() => player.setMuted(true)).not.toThrow();
    expect(() => player.play('correct')).not.toThrow();
  });
});
