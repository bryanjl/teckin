import type { PauseController } from '@teckin/engine-core';

const pauseIconSvg =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>';

/**
 * Pause button in the top-right corner plus a "Paused" panel with a resume button.
 * The panel also appears after the tab was hidden while the player had paused.
 * Returns a function that removes both.
 */
export function attachPauseButton(parent: HTMLElement, controller: PauseController): () => void {
  const document = parent.ownerDocument;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'pause-button';
  button.setAttribute('aria-label', 'Pause');
  button.innerHTML = pauseIconSvg;
  Object.assign(button.style, {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
    width: '56px',
    height: '56px',
    padding: '14px',
    borderRadius: '16px',
    border: '2px solid rgba(255, 255, 255, 0.5)',
    background: 'rgba(15, 23, 42, 0.45)',
    color: '#f8fafc',
    touchAction: 'manipulation',
    zIndex: '15',
  } satisfies Partial<CSSStyleDeclaration>);
  const onPauseClick = (): void => controller.pause('player');
  button.addEventListener('click', onPauseClick);

  const panel = document.createElement('div');
  panel.dataset.testid = 'pause-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Paused');
  Object.assign(panel.style, {
    position: 'absolute',
    inset: '0',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    background: 'rgba(2, 6, 23, 0.72)',
    color: '#f8fafc',
    font: '600 28px/1.2 system-ui, sans-serif',
    zIndex: '30',
  } satisfies Partial<CSSStyleDeclaration>);
  const heading = document.createElement('p');
  heading.textContent = 'Paused';
  heading.style.margin = '0';
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.dataset.testid = 'resume-button';
  resume.textContent = 'Resume';
  Object.assign(resume.style, {
    minWidth: '160px',
    minHeight: '56px',
    padding: '0 28px',
    borderRadius: '16px',
    border: 'none',
    background: '#f59e0b',
    color: '#1c1917',
    font: '600 20px system-ui, sans-serif',
    touchAction: 'manipulation',
  } satisfies Partial<CSSStyleDeclaration>);
  const onResumeClick = (): void => controller.resume('player');
  resume.addEventListener('click', onResumeClick);
  panel.append(heading, resume);

  const unsubscribe = controller.onChange((_paused, reasons) => {
    panel.style.display = reasons.includes('player') ? 'flex' : 'none';
  });

  parent.append(button, panel);
  return () => {
    unsubscribe();
    button.removeEventListener('click', onPauseClick);
    resume.removeEventListener('click', onResumeClick);
    button.remove();
    panel.remove();
  };
}
