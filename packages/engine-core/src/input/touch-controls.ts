import type { ActionState } from './action-state';

/** One on-screen button and the action it holds while pressed. */
export interface TouchButtonSpec<Action extends string> {
  action: Action;
  /** Accessible name, read by screen readers. Not shown, so art carries no text. */
  label: string;
  /** Which bottom corner cluster the button sits in. */
  side: 'left' | 'right';
  /** Inline SVG markup for the icon. Must be original art. */
  iconSvg: string;
  /** Vibrate briefly when pressed, where the device supports it. */
  haptic?: boolean;
}

/** Options for {@link attachTouchControls}. */
export interface TouchControlsOptions<Action extends string> {
  buttons: readonly TouchButtonSpec<Action>[];
  /** Button edge length in CSS pixels. The spec requires at least 72. */
  buttonSize?: number;
  /**
   * When to show the controls: `always`, or `auto` (shown on coarse-pointer devices and as
   * soon as the screen is touched, hidden for mouse-only laptops).
   */
  visibility?: 'always' | 'auto';
}

/** Minimum touch control size from the spec. */
export const minimumTouchButtonSize = 72;

const arrowLeftSvg =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrowRightSvg =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const jumpSvg =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15 12 7l8 8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 20h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

/** Standard platformer layout: left and right bottom-left, jump bottom-right. */
export const platformerTouchButtons: readonly TouchButtonSpec<'moveLeft' | 'moveRight' | 'jump'>[] =
  [
    { action: 'moveLeft', label: 'Move left', side: 'left', iconSvg: arrowLeftSvg },
    { action: 'moveRight', label: 'Move right', side: 'left', iconSvg: arrowRightSvg },
    { action: 'jump', label: 'Jump', side: 'right', iconSvg: jumpSvg, haptic: true },
  ];

/**
 * Adds semi-transparent on-screen buttons over `parent` that press actions in `state`.
 * Every pointer is tracked separately, so a player can hold right with one thumb and tap
 * jump with the other. Buttons sit inside the safe-area insets.
 * Returns a function that removes the buttons and releases anything they held.
 */
export function attachTouchControls<Action extends string>(
  parent: HTMLElement,
  state: ActionState<Action>,
  options: TouchControlsOptions<Action>,
): () => void {
  const document = parent.ownerDocument;
  const window = document.defaultView;
  const size = Math.max(options.buttonSize ?? 76, minimumTouchButtonSize);
  const gap = 12;

  const layer = document.createElement('div');
  layer.dataset.testid = 'touch-controls';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Game controls');
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '10',
  } satisfies Partial<CSSStyleDeclaration>);

  const clusters = {
    left: createCluster(document, 'left', gap),
    right: createCluster(document, 'right', gap),
  };
  layer.append(clusters.left, clusters.right);

  const pointerSources = new Map<number, { action: Action; button: HTMLElement }>();
  const cleanups: (() => void)[] = [];

  for (const spec of options.buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = spec.action;
    button.dataset.testid = `touch-${spec.action}`;
    button.setAttribute('aria-label', spec.label);
    button.innerHTML = spec.iconSvg;
    Object.assign(button.style, {
      width: `${size}px`,
      height: `${size}px`,
      padding: `${Math.round(size * 0.22)}px`,
      borderRadius: '50%',
      border: '3px solid rgba(255, 255, 255, 0.55)',
      background: 'rgba(15, 23, 42, 0.35)',
      color: 'rgba(255, 255, 255, 0.9)',
      pointerEvents: 'auto',
      touchAction: 'none',
      userSelect: 'none',
      webkitUserSelect: 'none',
      outline: 'none',
      transition: 'transform 60ms, background 60ms',
    } satisfies Partial<CSSStyleDeclaration>);

    const setPressedLook = (pressed: boolean): void => {
      button.style.background = pressed ? 'rgba(255, 255, 255, 0.4)' : 'rgba(15, 23, 42, 0.35)';
      button.style.transform = pressed ? 'scale(0.94)' : 'none';
    };

    const onPointerDown = (event: PointerEvent): void => {
      event.preventDefault();
      // Capture keeps the release event coming to this button even if the thumb slides off.
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers in some test environments cannot be captured; tracking still works.
      }
      pointerSources.set(event.pointerId, { action: spec.action, button });
      state.press(spec.action, pointerSourceId(event.pointerId));
      setPressedLook(true);
      if (spec.haptic) vibrate(window);
    };
    const onPointerEnd = (event: PointerEvent): void => {
      const held = pointerSources.get(event.pointerId);
      if (!held || held.button !== button) return;
      pointerSources.delete(event.pointerId);
      state.release(spec.action, pointerSourceId(event.pointerId));
      if (![...pointerSources.values()].some((source) => source.button === button)) {
        setPressedLook(false);
      }
    };
    const blockMenu = (event: Event): void => event.preventDefault();

    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointerup', onPointerEnd);
    button.addEventListener('pointercancel', onPointerEnd);
    button.addEventListener('lostpointercapture', onPointerEnd);
    button.addEventListener('contextmenu', blockMenu);
    cleanups.push(() => {
      button.removeEventListener('pointerdown', onPointerDown);
      button.removeEventListener('pointerup', onPointerEnd);
      button.removeEventListener('pointercancel', onPointerEnd);
      button.removeEventListener('lostpointercapture', onPointerEnd);
      button.removeEventListener('contextmenu', blockMenu);
    });

    clusters[spec.side].append(button);
  }

  const setVisible = (visible: boolean): void => {
    layer.style.display = visible ? 'block' : 'none';
  };
  if ((options.visibility ?? 'auto') === 'auto') {
    const coarse = window?.matchMedia?.('(any-pointer: coarse)').matches ?? false;
    setVisible(coarse);
    if (!coarse && window) {
      const showOnTouch = (event: PointerEvent): void => {
        if (event.pointerType === 'touch') setVisible(true);
      };
      window.addEventListener('pointerdown', showOnTouch, { capture: true });
      cleanups.push(() =>
        window.removeEventListener('pointerdown', showOnTouch, { capture: true }),
      );
    }
  } else {
    setVisible(true);
  }

  parent.append(layer);

  return () => {
    for (const cleanup of cleanups) cleanup();
    for (const pointerId of pointerSources.keys()) {
      state.releaseSource(pointerSourceId(pointerId));
    }
    pointerSources.clear();
    layer.remove();
  };
}

function createCluster(document: Document, side: 'left' | 'right', gap: number): HTMLElement {
  const cluster = document.createElement('div');
  const edge = 16;
  Object.assign(cluster.style, {
    position: 'absolute',
    display: 'flex',
    gap: `${gap}px`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${edge}px)`,
    [side]: `calc(env(safe-area-inset-${side}, 0px) + ${edge}px)`,
    pointerEvents: 'none',
  });
  cluster.dataset.testid = `touch-cluster-${side}`;
  return cluster;
}

function pointerSourceId(pointerId: number): string {
  return `pointer:${pointerId}`;
}

function vibrate(window: Window | null): void {
  try {
    window?.navigator.vibrate?.(8);
  } catch {
    // Some browsers throw when vibration is blocked by policy; the tick is optional.
  }
}
