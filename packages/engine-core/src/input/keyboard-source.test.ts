import { describe, expect, it } from 'vitest';
import { createPlatformerActionState } from './action-state';
import { attachKeyboardSource, platformerKeyBindings } from './keyboard-source';

function key(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return new KeyboardEvent(type, { code, cancelable: true });
}

describe('attachKeyboardSource', () => {
  it('maps arrows, WASD and space to the same actions as touch', () => {
    const state = createPlatformerActionState();
    const target = new EventTarget();
    attachKeyboardSource(target, state, platformerKeyBindings);

    for (const [code, action] of [
      ['ArrowLeft', 'moveLeft'],
      ['KeyA', 'moveLeft'],
      ['ArrowRight', 'moveRight'],
      ['KeyD', 'moveRight'],
      ['Space', 'jump'],
      ['ArrowUp', 'jump'],
      ['KeyW', 'jump'],
    ] as const) {
      target.dispatchEvent(key('keydown', code));
      expect(state.isDown(action), code).toBe(true);
      target.dispatchEvent(key('keyup', code));
      expect(state.isDown(action), code).toBe(false);
    }
  });

  it('prevents the default page scroll for bound keys only', () => {
    const state = createPlatformerActionState();
    const target = new EventTarget();
    attachKeyboardSource(target, state, platformerKeyBindings);
    const space = key('keydown', 'Space');
    const letter = key('keydown', 'KeyQ');
    target.dispatchEvent(space);
    target.dispatchEvent(letter);
    expect(space.defaultPrevented).toBe(true);
    expect(letter.defaultPrevented).toBe(false);
  });

  it('keeps moving while a second key for the same action is still held', () => {
    const state = createPlatformerActionState();
    const target = new EventTarget();
    attachKeyboardSource(target, state, platformerKeyBindings);
    target.dispatchEvent(key('keydown', 'KeyA'));
    target.dispatchEvent(key('keydown', 'ArrowLeft'));
    target.dispatchEvent(key('keyup', 'KeyA'));
    expect(state.isDown('moveLeft')).toBe(true);
  });

  it('releases held keys when the window loses focus and when detached', () => {
    const state = createPlatformerActionState();
    const target = new EventTarget();
    const detach = attachKeyboardSource(target, state, platformerKeyBindings);
    target.dispatchEvent(key('keydown', 'KeyD'));
    target.dispatchEvent(new Event('blur'));
    expect(state.isDown('moveRight')).toBe(false);

    target.dispatchEvent(key('keydown', 'Space'));
    detach();
    expect(state.isDown('jump')).toBe(false);
    target.dispatchEvent(key('keydown', 'Space'));
    expect(state.isDown('jump')).toBe(false);
  });

  it('leaves keys alone inside dialogs and form controls', () => {
    const state = createPlatformerActionState();
    attachKeyboardSource(window, state, platformerKeyBindings);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    const slider = document.createElement('input');
    document.body.append(dialog, slider);
    const inDialog = new KeyboardEvent('keydown', {
      code: 'Space',
      cancelable: true,
      bubbles: true,
    });
    button.dispatchEvent(inDialog);
    expect(state.isDown('jump')).toBe(false);
    expect(inDialog.defaultPrevented).toBe(false);
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowLeft', cancelable: true, bubbles: true }),
    );
    expect(state.isDown('moveLeft')).toBe(false);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', cancelable: true, bubbles: true }),
    );
    expect(state.isDown('jump')).toBe(true);
    dialog.remove();
    slider.remove();
  });
});
