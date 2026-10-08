import type { GameSoundName, GameSoundPlayer } from '@teckin/game-contracts';

/** One tone in a synthesised sound. */
interface Tone {
  /** Start, seconds after the sound begins. */
  at: number;
  duration: number;
  /** Start and end frequency in hertz; a difference gives a sweep. */
  from: number;
  to: number;
  type: OscillatorType;
  volume: number;
}

const note = (at: number, frequency: number, duration = 0.12, volume = 0.18): Tone => ({
  at,
  duration,
  from: frequency,
  to: frequency,
  type: 'triangle',
  volume,
});

/** Every sound is a few oscillator tones: no audio files, so nothing to license. */
const recipes: Record<GameSoundName, Tone[]> = {
  jump: [{ at: 0, duration: 0.12, from: 320, to: 640, type: 'square', volume: 0.06 }],
  land: [{ at: 0, duration: 0.07, from: 160, to: 90, type: 'sine', volume: 0.2 }],
  correct: [note(0, 660), note(0.09, 880, 0.18)],
  wrong: [{ at: 0, duration: 0.28, from: 220, to: 180, type: 'sawtooth', volume: 0.07 }],
  summit: [note(0, 523), note(0.1, 659), note(0.2, 784), note(0.3, 1047, 0.25)],
  finish: [note(0, 523), note(0.12, 659), note(0.24, 784), note(0.36, 1047), note(0.5, 1319, 0.4)],
  tap: [{ at: 0, duration: 0.03, from: 1200, to: 900, type: 'sine', volume: 0.08 }],
};

/** Options for {@link createSynthSoundPlayer}. */
export interface SynthSoundOptions {
  /** Where the mute choice is remembered; `null` remembers nothing. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Storage key for the mute choice. */
  storageKey?: string;
  /** Creates the audio context on first use; absent where Web Audio is unavailable. */
  createContext?: () => AudioContext;
}

/**
 * A {@link GameSoundPlayer} that synthesises every sound with Web Audio. The audio context
 * is created on the first sound (after a tap, as mobile browsers require), muting is saved
 * to `storage` when possible, and anything that fails is silently skipped: sound is never
 * worth breaking the game for.
 */
export function createSynthSoundPlayer(options: SynthSoundOptions): GameSoundPlayer {
  const storageKey = options.storageKey ?? 'teckin.muted';
  let muted = readMuted(options.storage, storageKey);
  let context: AudioContext | undefined;
  const listeners = new Set<(muted: boolean) => void>();

  const audio = (): AudioContext | undefined => {
    if (!context && options.createContext) {
      try {
        context = options.createContext();
      } catch {
        return undefined;
      }
    }
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  };

  return {
    get muted() {
      return muted;
    },
    setMuted(next) {
      if (next === muted) return;
      muted = next;
      try {
        options.storage?.setItem(storageKey, muted ? '1' : '0');
      } catch {
        // Private mode or blocked storage: the choice lasts for this visit only.
      }
      for (const listener of listeners) listener(muted);
    },
    onMutedChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unlock() {
      audio();
    },
    play(name) {
      if (muted) return;
      const ctx = audio();
      if (!ctx) return;
      try {
        const start = ctx.currentTime + 0.005;
        for (const tone of recipes[name]) playTone(ctx, tone, start);
      } catch {
        // Ignore: a missed sound is better than an error mid-game.
      }
    },
  };
}

function playTone(context: AudioContext, tone: Tone, start: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const begin = start + tone.at;
  const end = begin + tone.duration;
  oscillator.type = tone.type;
  oscillator.frequency.setValueAtTime(tone.from, begin);
  oscillator.frequency.linearRampToValueAtTime(tone.to, end);
  gain.gain.setValueAtTime(0.0001, begin);
  gain.gain.exponentialRampToValueAtTime(tone.volume, begin + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(begin);
  oscillator.stop(end + 0.02);
}

function readMuted(storage: SynthSoundOptions['storage'], key: string): boolean {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Names of the sounds {@link createSynthSoundPlayer} can play, for tests and previews. */
export const synthSoundNames = Object.keys(recipes) as GameSoundName[];
