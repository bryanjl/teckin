import type { PauseController } from '@teckin/engine-core';

/** Theme-supplied look of the pause button and panel. */
export interface PauseButtonTheme {
  /** Icon markup; draws with `currentColor`. */
  iconSvg: string;
  /** Six-digit hex colours. */
  accent: string;
  text: string;
  panel: string;
  fontFamily: string;
}

/**
 * Pause button in the top-right corner plus a "Paused" panel with a resume button.
 * The panel also appears after the tab was hidden while the player had paused.
 * Returns a function that removes both.
 */
export function attachPauseButton(
  parent: HTMLElement,
  controller: PauseController,
  theme: PauseButtonTheme,
): () => void {
  const document = parent.ownerDocument;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'pause-button';
  button.setAttribute('aria-label', 'Pause');
  button.innerHTML = theme.iconSvg;
  Object.assign(button.style, {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
    width: '56px',
    height: '56px',
    padding: '14px',
    borderRadius: '16px',
    border: '2px solid rgba(255, 255, 255, 0.5)',
    background: `${theme.panel}73`,
    color: theme.text,
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
    background: `${theme.panel}b8`,
    color: theme.text,
    font: `600 28px/1.2 ${theme.fontFamily}`,
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
    background: theme.accent,
    color: theme.panel,
    font: `600 20px ${theme.fontFamily}`,
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
