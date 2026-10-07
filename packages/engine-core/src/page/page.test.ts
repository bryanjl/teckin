import { describe, expect, it, vi } from 'vitest';
import { PauseController, pauseWhenHidden } from './pause-controller';
import { guardPlaySurface } from './play-surface-guards';

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('PauseController', () => {
  it('stays paused until every reason is lifted', () => {
    const controller = new PauseController();
    controller.pause('player');
    controller.pause('hidden');
    controller.resume('hidden');
    expect(controller.isPaused).toBe(true);
    controller.togglePlayerPause();
    expect(controller.isPaused).toBe(false);
  });

  it('notifies listeners on each change', () => {
    const controller = new PauseController();
    const listener = vi.fn();
    controller.onChange(listener);
    controller.pause('hidden');
    controller.pause('hidden');
    controller.resume('hidden');
    expect(listener.mock.calls).toEqual([
      [true, ['hidden']],
      [false, []],
    ]);
  });

  it('pauses while the tab is hidden and resumes when shown', () => {
    const controller = new PauseController();
    setVisibility('visible');
    const stop = pauseWhenHidden(document, controller);
    setVisibility('hidden');
    expect(controller.activeReasons).toEqual(['hidden']);
    setVisibility('visible');
    expect(controller.isPaused).toBe(false);
    stop();
    setVisibility('hidden');
    expect(controller.isPaused).toBe(false);
    setVisibility('visible');
  });
});

describe('guardPlaySurface', () => {
  it('blocks zoom, selection and pull-to-refresh, then restores the page', () => {
    document.body.setAttribute('style', 'color: red;');
    const restore = guardPlaySurface(document);
    expect(document.body.style.touchAction).toBe('none');
    expect(document.documentElement.style.overscrollBehavior).toBe('none');
    expect(document.body.style.userSelect).toBe('none');

    const menu = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    const select = new Event('selectstart', { cancelable: true });
    document.dispatchEvent(select);
    expect(select.defaultPrevented).toBe(true);

    restore();
    expect(document.body.getAttribute('style')).toBe('color: red;');
    expect(document.documentElement.getAttribute('style')).toBeNull();
    const laterMenu = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(laterMenu);
    expect(laterMenu.defaultPrevented).toBe(false);
  });
});
