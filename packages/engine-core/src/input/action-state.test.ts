import { describe, expect, it, vi } from 'vitest';
import { ActionState, createPlatformerActionState } from './action-state';

describe('ActionState', () => {
  it('holds an action while any source holds it', () => {
    const state = createPlatformerActionState();
    state.press('moveRight', 'key:ArrowRight');
    state.press('moveRight', 'pointer:1');
    state.release('moveRight', 'key:ArrowRight');
    expect(state.isDown('moveRight')).toBe(true);
    state.release('moveRight', 'pointer:1');
    expect(state.isDown('moveRight')).toBe(false);
  });

  it('keeps separate actions independent, so moving and jumping combine', () => {
    const state = createPlatformerActionState();
    state.press('moveRight', 'pointer:1');
    state.press('jump', 'pointer:2');
    expect(state.heldActions()).toEqual(['moveRight', 'jump']);
    state.release('jump', 'pointer:2');
    expect(state.heldActions()).toEqual(['moveRight']);
  });

  it('reports a press edge for exactly one frame', () => {
    const state = createPlatformerActionState();
    state.press('jump', 'key:Space');
    expect(state.justPressed('jump')).toBe(false);
    state.beginFrame();
    expect(state.justPressed('jump')).toBe(true);
    state.beginFrame();
    expect(state.justPressed('jump')).toBe(false);
    expect(state.isDown('jump')).toBe(true);
  });

  it('reports a tap that starts and ends between two frames as pressed and released', () => {
    const state = createPlatformerActionState();
    state.press('jump', 'pointer:4');
    state.release('jump', 'pointer:4');
    state.beginFrame();
    expect(state.justPressed('jump')).toBe(true);
    expect(state.justReleased('jump')).toBe(true);
    expect(state.isDown('jump')).toBe(false);
  });

  it('ignores a repeated press from the same source, like keyboard auto-repeat', () => {
    const state = createPlatformerActionState();
    const listener = vi.fn();
    state.onChange(listener);
    state.press('jump', 'key:Space');
    state.press('jump', 'key:Space');
    expect(listener).toHaveBeenCalledTimes(1);
    state.release('jump', 'key:Space');
    expect(state.isDown('jump')).toBe(false);
  });

  it('releases everything from one source or from all sources', () => {
    const state = createPlatformerActionState();
    state.press('moveLeft', 'pointer:1');
    state.press('jump', 'pointer:1');
    state.press('moveRight', 'key:KeyD');
    state.releaseSource('pointer:1');
    expect(state.heldActions()).toEqual(['moveRight']);
    state.releaseAll();
    expect(state.heldActions()).toEqual([]);
  });

  it('rejects unknown actions', () => {
    const state = new ActionState(['fire'] as const);
    expect(() => state.press('jump' as 'fire', 'x')).toThrow(/Unknown action/);
  });
});
