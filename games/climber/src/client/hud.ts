import { formatDuration } from '@teckin/engine-core';
import type { CourseHudState } from './course-scene';

/** Theme-supplied look of the HUD and the course-complete panel. */
export interface HudTheme {
  /** Six-digit hex colours. */
  accent: string;
  text: string;
  textMuted: string;
  panel: string;
  fontFamily: string;
  /** Summit names, in order. */
  summitNames: readonly string[];
}

/** The HUD's handle: update it every frame, show the finish panel, remove it. */
export interface CourseHud {
  update: (state: CourseHudState) => void;
  showComplete: (elapsedSeconds: number) => void;
  hideComplete: () => void;
  remove: () => void;
}

/** What the HUD's buttons do. */
export interface CourseHudActions {
  onRespawn: () => void;
  onPlayAgain: () => void;
}

/**
 * Height and summit readout at the top of the screen, a "Back to checkpoint" button when a
 * checkpoint can help, and the "Course complete" panel with the time and "Play again".
 * DOM text is only touched when it changes, so updating every frame is cheap.
 */
export function attachCourseHud(
  parent: HTMLElement,
  theme: HudTheme,
  actions: CourseHudActions,
): CourseHud {
  const document = parent.ownerDocument;
  const top = 'calc(env(safe-area-inset-top, 0px) + 12px)';

  const readout = document.createElement('div');
  readout.dataset.testid = 'hud';
  // Not a live region: the height changes every frame and would flood a screen reader.
  readout.setAttribute('aria-live', 'off');
  Object.assign(readout.style, {
    position: 'absolute',
    top,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: '120px',
    padding: '6px 16px 8px',
    borderRadius: '16px',
    background: `${theme.panel}99`,
    color: theme.text,
    textAlign: 'center',
    font: `700 26px/1.1 ${theme.fontFamily}`,
    pointerEvents: 'none',
    zIndex: '12',
  } satisfies Partial<CSSStyleDeclaration>);
  const height = document.createElement('div');
  height.dataset.testid = 'hud-height';
  const summit = document.createElement('div');
  summit.dataset.testid = 'hud-summit';
  Object.assign(summit.style, {
    font: `600 14px/1.2 ${theme.fontFamily}`,
    color: theme.textMuted,
    marginTop: '2px',
  } satisfies Partial<CSSStyleDeclaration>);
  readout.append(height, summit);

  const respawn = button(document, theme, 'respawn-button', 'Back to checkpoint');
  Object.assign(respawn.style, {
    position: 'absolute',
    top: `calc(env(safe-area-inset-top, 0px) + 84px)`,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    zIndex: '12',
  } satisfies Partial<CSSStyleDeclaration>);
  respawn.addEventListener('click', actions.onRespawn);

  const complete = document.createElement('div');
  complete.dataset.testid = 'course-complete';
  complete.setAttribute('role', 'dialog');
  complete.setAttribute('aria-label', 'Course complete');
  Object.assign(complete.style, {
    position: 'absolute',
    inset: '0',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '24px',
    background: `${theme.panel}d9`,
    color: theme.text,
    textAlign: 'center',
    font: `700 32px/1.2 ${theme.fontFamily}`,
    zIndex: '25',
  } satisfies Partial<CSSStyleDeclaration>);
  const heading = document.createElement('p');
  heading.textContent = 'Course complete';
  heading.style.margin = '0';
  const time = document.createElement('p');
  time.dataset.testid = 'course-time';
  Object.assign(time.style, {
    margin: '0',
    font: `600 22px/1.2 ${theme.fontFamily}`,
    color: theme.textMuted,
  } satisfies Partial<CSSStyleDeclaration>);
  const playAgain = button(document, theme, 'play-again-button', 'Play again');
  playAgain.addEventListener('click', actions.onPlayAgain);
  complete.append(heading, time, playAgain);

  parent.append(readout, respawn, complete);

  let shownHeight = '';
  let shownSummit = '';
  let shownRespawn = false;
  return {
    update: (state) => {
      const nextHeight = `${state.heightMetres} m`;
      if (nextHeight !== shownHeight) height.textContent = shownHeight = nextHeight;
      const nextSummit = theme.summitNames[state.summitIndex] ?? '';
      if (nextSummit !== shownSummit) summit.textContent = shownSummit = nextSummit;
      if (state.canRespawn !== shownRespawn) {
        shownRespawn = state.canRespawn;
        respawn.style.display = shownRespawn ? 'block' : 'none';
      }
    },
    showComplete: (elapsedSeconds) => {
      time.textContent = `Time ${formatDuration(elapsedSeconds)}`;
      complete.style.display = 'flex';
      playAgain.focus();
    },
    hideComplete: () => {
      complete.style.display = 'none';
    },
    remove: () => {
      respawn.removeEventListener('click', actions.onRespawn);
      playAgain.removeEventListener('click', actions.onPlayAgain);
      readout.remove();
      respawn.remove();
      complete.remove();
    },
  };
}

function button(
  document: Document,
  theme: HudTheme,
  testId: string,
  label: string,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.dataset.testid = testId;
  element.textContent = label;
  Object.assign(element.style, {
    minWidth: '160px',
    minHeight: '56px',
    padding: '0 24px',
    borderRadius: '16px',
    border: 'none',
    background: theme.accent,
    color: theme.panel,
    font: `600 20px ${theme.fontFamily}`,
    touchAction: 'manipulation',
  } satisfies Partial<CSSStyleDeclaration>);
  return element;
}
