/**
 * Small text overlay for `?debug=1`: shows whatever `readLines` returns (fps, player
 * position, held actions), refreshed four times a second so it costs almost nothing.
 * Returns a function that removes it.
 */
export function attachDebugOverlay(parent: HTMLElement, readLines: () => string[]): () => void {
  const document = parent.ownerDocument;
  const panel = document.createElement('pre');
  panel.dataset.testid = 'debug-overlay';
  Object.assign(panel.style, {
    position: 'absolute',
    // Below the centred HUD and its "Back to checkpoint" button, which reach about 140 px.
    top: 'calc(env(safe-area-inset-top, 0px) + 148px)',
    left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
    margin: '0',
    padding: '6px 8px',
    font: '11px/1.3 ui-monospace, monospace',
    color: '#e2e8f0',
    background: 'rgba(2, 6, 23, 0.6)',
    borderRadius: '6px',
    pointerEvents: 'none',
    zIndex: '20',
  } satisfies Partial<CSSStyleDeclaration>);
  parent.append(panel);

  const refresh = (): void => {
    panel.textContent = readLines().join('\n');
  };
  refresh();
  const timer = setInterval(refresh, 250);
  return () => {
    clearInterval(timer);
    panel.remove();
  };
}
