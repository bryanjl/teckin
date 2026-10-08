/**
 * Stops the browser's own gestures from interfering with play: pinch-zoom, double-tap zoom,
 * text selection, long-press menus and pull-to-refresh. Applied to the whole document while a
 * game is mounted, and undone when it unmounts.
 *
 * CSS (`touch-action`, `overscroll-behavior`, `user-select`) does most of the work; the event
 * listeners cover iOS Safari, which ignores `user-scalable=no` and still fires gesture events.
 */
export function guardPlaySurface(document: Document): () => void {
  const root = document.documentElement;
  const body = document.body;
  const previousRootStyle = root.getAttribute('style');
  const previousBodyStyle = body.getAttribute('style');

  for (const element of [root, body]) {
    Object.assign(element.style, {
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      userSelect: 'none',
      webkitUserSelect: 'none',
      webkitTouchCallout: 'none',
      webkitTapHighlightColor: 'transparent',
    });
  }
  body.style.position = 'fixed';
  body.style.inset = '0';

  const preventDefault = (event: Event): void => {
    if (event.cancelable) event.preventDefault();
  };
  const preventMultiTouchMove = (event: Event): void => {
    // Single-finger moves on the canvas are already blocked by `touch-action: none`;
    // this stops two-finger pinch on browsers that ignore it.
    if ((event as TouchEvent).touches?.length > 1 && event.cancelable) event.preventDefault();
  };
  let lastTouchEnd = 0;
  const preventDoubleTapZoom = (event: Event): void => {
    const now = event.timeStamp;
    // Cancelling a touchend also cancels its click, so never do it on a button: a quick tap
    // on Pause right after lifting off Jump must still work. Buttons opt out of double-tap
    // zoom with `touch-action` instead.
    const target = event.target as Element | null;
    const onButton = typeof target?.closest === 'function' && target.closest('button') !== null;
    if (!onButton && now - lastTouchEnd < 350 && event.cancelable) event.preventDefault();
    lastTouchEnd = now;
  };

  const listeners: [string, (event: Event) => void, AddEventListenerOptions][] = [
    ['gesturestart', preventDefault, { passive: false }],
    ['gesturechange', preventDefault, { passive: false }],
    ['gestureend', preventDefault, { passive: false }],
    ['contextmenu', preventDefault, { passive: false }],
    ['selectstart', preventDefault, { passive: false }],
    ['dblclick', preventDefault, { passive: false }],
    ['touchmove', preventMultiTouchMove, { passive: false }],
    ['touchend', preventDoubleTapZoom, { passive: false }],
  ];
  for (const [type, listener, options] of listeners) {
    document.addEventListener(type, listener, options);
  }

  return () => {
    for (const [type, listener, options] of listeners) {
      document.removeEventListener(type, listener, options);
    }
    restoreStyle(root, previousRootStyle);
    restoreStyle(body, previousBodyStyle);
  };
}

function restoreStyle(element: HTMLElement, previous: string | null): void {
  if (previous === null) element.removeAttribute('style');
  else element.setAttribute('style', previous);
}
