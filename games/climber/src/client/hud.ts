import type { CourseHudState } from './course-scene';

/** Theme-supplied look of the HUD. */
export interface HudTheme {
  /** Six-digit hex colours. */
  accent: string;
  text: string;
  textMuted: string;
  panel: string;
  wrong: string;
  fontFamily: string;
  /** Summit names, in order. */
  summitNames: readonly string[];
  /** The theme's word for energy. */
  energyWord: string;
}

/** Energy shown by the meter. */
export interface HudEnergy {
  energy: number;
  /** Energy at which the meter is drawn full. */
  full: number;
  /** The "Get energy" button pulses below this. */
  low: number;
}

/** The HUD's handle: update it every frame (and on energy changes), remove it. */
export interface CourseHud {
  update: (state: CourseHudState) => void;
  setEnergy: (energy: HudEnergy) => void;
  /** Shows a compact line such as "2nd of 5 · 4:32" (multiplayer), or hides it with `null`. */
  setRank: (text: string | null) => void;
  remove: () => void;
}

/** What the HUD's buttons do. */
export interface CourseHudActions {
  onRespawn: () => void;
  onGetEnergy: () => void;
}

/**
 * Height and summit readout at the top centre, the energy meter (which is also the
 * "Get energy" button) at the top left, and a "Back to checkpoint" button when a checkpoint
 * can help. DOM is only touched when something changes, so updating every frame is cheap.
 */
export function attachCourseHud(
  parent: HTMLElement,
  theme: HudTheme,
  actions: CourseHudActions,
): CourseHud {
  const document = parent.ownerDocument;
  const top = 'calc(env(safe-area-inset-top, 0px) + 12px)';

  const style = document.createElement('style');
  style.textContent = `
@keyframes teckin-energy-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
[data-testid="get-energy-button"][data-low="true"] { animation: teckin-energy-pulse 0.9s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  [data-testid="get-energy-button"][data-low="true"] { animation: none; outline: 3px solid ${theme.accent}; }
}`;

  const readout = document.createElement('div');
  readout.dataset.testid = 'hud';
  // Not a live region: the height changes every frame and would flood a screen reader.
  readout.setAttribute('aria-live', 'off');
  Object.assign(readout.style, {
    position: 'absolute',
    top,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: '112px',
    padding: '6px 14px 8px',
    borderRadius: '16px',
    background: `${theme.panel}99`,
    color: theme.text,
    textAlign: 'center',
    font: `700 24px/1.1 ${theme.fontFamily}`,
    pointerEvents: 'none',
    zIndex: '12',
  } satisfies Partial<CSSStyleDeclaration>);
  const height = document.createElement('div');
  height.dataset.testid = 'hud-height';
  const summit = document.createElement('div');
  summit.dataset.testid = 'hud-summit';
  Object.assign(summit.style, {
    font: `600 13px/1.2 ${theme.fontFamily}`,
    color: theme.textMuted,
    marginTop: '2px',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  const rank = document.createElement('div');
  rank.dataset.testid = 'hud-rank';
  Object.assign(rank.style, {
    display: 'none',
    font: `700 13px/1.2 ${theme.fontFamily}`,
    color: theme.accent,
    marginTop: '2px',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  readout.append(height, summit, rank);

  const meter = document.createElement('button');
  meter.type = 'button';
  meter.dataset.testid = 'get-energy-button';
  Object.assign(meter.style, {
    position: 'absolute',
    top,
    left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
    width: '96px',
    minHeight: '56px',
    padding: '6px 8px',
    borderRadius: '16px',
    border: `2px solid ${theme.accent}`,
    background: `${theme.panel}cc`,
    color: theme.text,
    font: `700 13px/1.15 ${theme.fontFamily}`,
    textAlign: 'left',
    touchAction: 'manipulation',
    zIndex: '14',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  const meterLabel = document.createElement('span');
  meterLabel.dataset.testid = 'energy-value';
  meterLabel.style.display = 'block';
  const bar = document.createElement('span');
  Object.assign(bar.style, {
    display: 'block',
    height: '8px',
    margin: '4px 0',
    borderRadius: '4px',
    background: `${theme.text}33`,
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);
  const fill = document.createElement('span');
  fill.dataset.testid = 'energy-fill';
  Object.assign(fill.style, {
    display: 'block',
    height: '100%',
    width: '0%',
    background: theme.accent,
    transition: 'width 250ms ease-out',
  } satisfies Partial<CSSStyleDeclaration>);
  bar.append(fill);
  const meterAction = document.createElement('span');
  meterAction.textContent = `Get ${theme.energyWord.toLowerCase()}`;
  Object.assign(meterAction.style, {
    display: 'block',
    color: theme.accent,
    font: `700 12px/1.1 ${theme.fontFamily}`,
  } satisfies Partial<CSSStyleDeclaration>);
  meter.append(meterLabel, bar, meterAction);
  meter.addEventListener('click', actions.onGetEnergy);

  const respawn = document.createElement('button');
  respawn.type = 'button';
  respawn.dataset.testid = 'respawn-button';
  respawn.textContent = 'Back to checkpoint';
  Object.assign(respawn.style, {
    position: 'absolute',
    top: `calc(env(safe-area-inset-top, 0px) + 84px)`,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    minWidth: '160px',
    minHeight: '56px',
    padding: '0 24px',
    borderRadius: '16px',
    border: 'none',
    background: theme.accent,
    color: theme.panel,
    font: `600 20px ${theme.fontFamily}`,
    touchAction: 'manipulation',
    zIndex: '12',
  } satisfies Partial<CSSStyleDeclaration>);
  respawn.addEventListener('click', actions.onRespawn);

  parent.append(style, readout, meter, respawn);

  let shownHeight = '';
  let shownSummit = '';
  let shownRespawn = false;
  let shownEnergy = '';
  let shownRank: string | null = null;
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
    setEnergy: ({ energy, full, low }) => {
      const key = `${energy}/${full}/${low}`;
      if (key === shownEnergy) return;
      shownEnergy = key;
      meter.dataset.energy = String(energy);
      meter.dataset.low = String(energy < low);
      meterLabel.textContent =
        energy > 0 ? `${theme.energyWord} ${energy}` : `${theme.energyWord} empty`;
      meterLabel.style.color = energy < low ? theme.wrong : theme.text;
      fill.style.width = `${Math.min(100, (energy / full) * 100)}%`;
      meter.setAttribute(
        'aria-label',
        `Get ${theme.energyWord.toLowerCase()}. ${theme.energyWord}: ${energy}`,
      );
    },
    setRank: (text) => {
      if (text === shownRank) return;
      shownRank = text;
      rank.textContent = text ?? '';
      rank.style.display = text === null ? 'none' : 'block';
    },
    remove: () => {
      meter.removeEventListener('click', actions.onGetEnergy);
      respawn.removeEventListener('click', actions.onRespawn);
      style.remove();
      readout.remove();
      meter.remove();
      respawn.remove();
    },
  };
}
