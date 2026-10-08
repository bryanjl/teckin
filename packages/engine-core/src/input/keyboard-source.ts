import type { ActionState, PlatformerAction } from './action-state';

/** Maps `KeyboardEvent.code` values to actions. */
export type KeyBindings<Action extends string> = Readonly<Record<string, Action>>;

/** Arrows, WASD and space, as the spec asks. W and up arrow also jump. */
export const platformerKeyBindings: KeyBindings<PlatformerAction> = {
  ArrowLeft: 'moveLeft',
  KeyA: 'moveLeft',
  ArrowRight: 'moveRight',
  KeyD: 'moveRight',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
};

/**
 * Feeds keyboard events into `state` using `bindings`. Each physical key is its own source,
 * so holding A and the left arrow together and releasing one keeps moving left.
 * Returns a function that detaches the listeners and releases held keys.
 */
export function attachKeyboardSource<Action extends string>(
  target: EventTarget,
  state: ActionState<Action>,
  bindings: KeyBindings<Action>,
): () => void {
  const heldCodes = new Set<string>();

  const onKeyDown = (rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    const action = bindings[event.code];
    if (!action || isTypingOrDialogTarget(event.target)) return;
    // Stops space and the arrows from scrolling the page while playing.
    event.preventDefault();
    heldCodes.add(event.code);
    state.press(action, keySourceId(event.code));
  };
  const onKeyUp = (rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    const action = bindings[event.code];
    if (!action) return;
    heldCodes.delete(event.code);
    state.release(action, keySourceId(event.code));
  };
  // Key-up events are lost when the window loses focus, so treat blur as releasing every key.
  const onBlur = (): void => releaseHeld();

  function releaseHeld(): void {
    for (const code of heldCodes) {
      const action = bindings[code];
      if (action) state.release(action, keySourceId(code));
    }
    heldCodes.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
    releaseHeld();
  };
}

/**
 * Keys pressed in a form control or an open dialog (the question sheet, results, pause
 * panel) belong to it: Space must press the focused answer button, arrows must move a slider.
 */
function isTypingOrDialogTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  if (!element || typeof element.closest !== 'function') return false;
  return element.closest('input, textarea, select, [role="dialog"]') !== null;
}

function keySourceId(code: string): string {
  return `key:${code}`;
}
