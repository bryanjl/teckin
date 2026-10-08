import type { ClientGameShell } from '@teckin/game-contracts';
import type { ClimberTunables } from '../tunables';

/** One slider in the tuning panel. */
interface Slider {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  read: () => number;
  write: (value: number) => void;
}

/** Look of the tuning panel. */
export interface TuningPanelTheme {
  accent: string;
  text: string;
  panel: string;
  fontFamily: string;
}

/**
 * `?tune=1` balance panel: sliders that change energy per answer, jump costs, walking cost
 * and gravity while the game runs, so balance can be tried on a phone without restarting.
 * `tunables` must be a live, writable copy; the run reads it every step.
 */
export function attachTuningPanel(
  parent: HTMLElement,
  tunables: ClimberTunables,
  shell: ClientGameShell,
  theme: TuningPanelTheme,
): () => void {
  const document = parent.ownerDocument;
  const sliders: Slider[] = [
    ...(shell.tuning
      ? [
          {
            id: 'energy-per-answer',
            label: 'Energy per correct answer',
            min: 20,
            max: 500,
            step: 10,
            read: () => shell.tuning?.energyPerCorrectAnswer ?? 0,
            write: (value: number) => shell.tuning?.setEnergyPerCorrectAnswer(value),
          },
        ]
      : []),
    slider('jump-cost', 'Jump cost', 0, 60, 1, tunables, 'jumpCost'),
    slider('double-jump-cost', 'Double jump cost', 0, 80, 1, tunables, 'doubleJumpCost'),
    slider('walking-cost', 'Walking cost per tile', 0, 6, 1, tunables, 'walkingCostPerTile'),
    {
      id: 'gravity',
      label: 'Gravity',
      min: 800,
      max: 2200,
      step: 50,
      read: () => tunables.physics.gravity,
      write: (value) => {
        tunables.physics.gravity = value;
      },
    },
  ];

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.testid = 'tuning-toggle';
  toggle.textContent = 'Tune';
  Object.assign(toggle.style, {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top, 0px) + 76px)',
    left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
    minWidth: '56px',
    minHeight: '44px',
    borderRadius: '12px',
    border: `2px solid ${theme.accent}`,
    background: `${theme.panel}cc`,
    color: theme.text,
    font: `700 14px ${theme.fontFamily}`,
    zIndex: '16',
  } satisfies Partial<CSSStyleDeclaration>);

  const panel = document.createElement('div');
  panel.dataset.testid = 'tuning-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Tuning');
  Object.assign(panel.style, {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top, 0px) + 128px)',
    left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
    width: 'min(320px, calc(100% - 24px))',
    maxHeight: '55%',
    overflowY: 'auto',
    touchAction: 'pan-y',
    display: 'none',
    padding: '12px',
    borderRadius: '14px',
    background: `${theme.panel}ee`,
    color: theme.text,
    font: `500 14px/1.3 ${theme.fontFamily}`,
    zIndex: '16',
  } satisfies Partial<CSSStyleDeclaration>);

  for (const item of sliders) {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'block', marginBottom: '10px' });
    const caption = document.createElement('span');
    const value = document.createElement('output');
    value.dataset.testid = `tune-value-${item.id}`;
    value.style.float = 'right';
    value.style.fontWeight = '700';
    caption.textContent = item.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.dataset.testid = `tune-${item.id}`;
    input.min = String(item.min);
    input.max = String(item.max);
    input.step = String(item.step);
    input.value = String(item.read());
    value.textContent = input.value;
    Object.assign(input.style, { width: '100%', touchAction: 'pan-x', accentColor: theme.accent });
    input.addEventListener('input', () => {
      const next = Number(input.value);
      item.write(next);
      value.textContent = String(next);
    });
    row.append(caption, value, input);
    panel.append(row);
  }

  const onToggle = (): void => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };
  toggle.addEventListener('click', onToggle);
  parent.append(toggle, panel);
  return () => {
    toggle.removeEventListener('click', onToggle);
    toggle.remove();
    panel.remove();
  };
}

type NumericKey = 'jumpCost' | 'doubleJumpCost' | 'walkingCostPerTile';

function slider(
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  tunables: ClimberTunables,
  key: NumericKey,
): Slider {
  return {
    id,
    label,
    min,
    max,
    step,
    read: () => tunables[key],
    write: (value) => {
      tunables[key] = value;
    },
  };
}
