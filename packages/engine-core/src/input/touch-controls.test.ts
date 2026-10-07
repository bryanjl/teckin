import { afterEach, describe, expect, it } from 'vitest';
import { createPlatformerActionState } from './action-state';
import {
  attachTouchControls,
  minimumTouchButtonSize,
  platformerTouchButtons,
} from './touch-controls';

function pointer(type: string, pointerId: number): PointerEvent {
  return new PointerEvent(type, {
    pointerId,
    pointerType: 'touch',
    bubbles: true,
    cancelable: true,
  });
}

function setup(buttonSize?: number) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const state = createPlatformerActionState();
  const detach = attachTouchControls(parent, state, {
    buttons: platformerTouchButtons,
    visibility: 'always',
    ...(buttonSize === undefined ? {} : { buttonSize }),
  });
  const button = (action: string): HTMLElement => {
    const element = parent.querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (!element) throw new Error(`No button for ${action}`);
    return element;
  };
  return { parent, state, detach, button };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('attachTouchControls', () => {
  it('places move buttons bottom-left and jump bottom-right', () => {
    const { parent } = setup();
    const left = parent.querySelector('[data-testid="touch-cluster-left"]');
    const right = parent.querySelector('[data-testid="touch-cluster-right"]');
    expect([...(left?.children ?? [])].map((b) => (b as HTMLElement).dataset.action)).toEqual([
      'moveLeft',
      'moveRight',
    ]);
    expect([...(right?.children ?? [])].map((b) => (b as HTMLElement).dataset.action)).toEqual([
      'jump',
    ]);
  });

  it('keeps clusters inside the safe-area insets', () => {
    const { parent } = setup();
    const left = parent.querySelector<HTMLElement>('[data-testid="touch-cluster-left"]');
    const right = parent.querySelector<HTMLElement>('[data-testid="touch-cluster-right"]');
    expect(left?.style.bottom).toContain('safe-area-inset-bottom');
    expect(left?.style.left).toContain('safe-area-inset-left');
    expect(right?.style.right).toContain('safe-area-inset-right');
  });

  it('never makes buttons smaller than the 72 px minimum', () => {
    const { button } = setup(40);
    expect(button('jump').style.width).toBe(`${minimumTouchButtonSize}px`);
  });

  it('tracks each finger separately: hold right and tap jump together', () => {
    const { state, button } = setup();
    button('moveRight').dispatchEvent(pointer('pointerdown', 1));
    button('jump').dispatchEvent(pointer('pointerdown', 2));
    expect(state.heldActions()).toEqual(['moveRight', 'jump']);

    button('jump').dispatchEvent(pointer('pointerup', 2));
    expect(state.heldActions()).toEqual(['moveRight']);
    button('moveRight').dispatchEvent(pointer('pointercancel', 1));
    expect(state.heldActions()).toEqual([]);
  });

  it('ignores a release from a finger that pressed a different button', () => {
    const { state, button } = setup();
    button('moveLeft').dispatchEvent(pointer('pointerdown', 3));
    button('jump').dispatchEvent(pointer('pointerup', 3));
    expect(state.isDown('moveLeft')).toBe(true);
  });

  it('releases held actions and removes the buttons when detached', () => {
    const { parent, state, detach, button } = setup();
    button('moveLeft').dispatchEvent(pointer('pointerdown', 5));
    detach();
    expect(state.isDown('moveLeft')).toBe(false);
    expect(parent.querySelector('[data-testid="touch-controls"]')).toBeNull();
  });
});
