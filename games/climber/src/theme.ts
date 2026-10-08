import { isThemeId, type ThemeRequirements } from '@teckin/engine-core';

/** Theme used when none is chosen. */
export const defaultClimberThemeId = 'cogspire';

/** Player colour variants every Climber theme provides, as `player-<id>` frames. */
export const climberPlayerVariants = [
  'amber',
  'red',
  'green',
  'blue',
  'purple',
  'pink',
  'teal',
  'white',
] as const;

/** One of {@link climberPlayerVariants}. */
export type ClimberPlayerVariant = (typeof climberPlayerVariants)[number];

/**
 * A flat colour for each player variant, for screens that draw players as dots instead of
 * sprites (the host's tower view). They match the body colours of the default theme's
 * variants, so a dot on the projector has the colour of that player's climber on the phones.
 */
export const climberVariantSwatches: Readonly<Record<ClimberPlayerVariant, string>> = {
  amber: '#d4a24c',
  red: '#d9534f',
  green: '#4caf6e',
  blue: '#4a8fd9',
  purple: '#9a6ad9',
  pink: '#e06aa8',
  teal: '#3fb3a8',
  white: '#d8dde8',
};

/** Everything the Climber game draws or names, which every Climber theme must supply. */
export const climberThemeRequirements: ThemeRequirements = {
  frames: [
    'player',
    ...climberPlayerVariants.map((variant) => `player-${variant}`),
    'tile-ground',
    'tile-platform',
    'background',
    'checkpoint',
    'summit-marker',
    'tile-moving',
    'tile-crumbling',
    'hazard-vent',
    'hazard-steam',
    'hazard-barrier',
    'hazard-barrier-emitter',
  ],
  ui: ['move-left', 'move-right', 'jump', 'pause', 'sound-on', 'sound-off'],
  colours: ['background', 'accent', 'text', 'text-muted', 'panel', 'correct', 'wrong'],
  summitCount: 6,
};

/**
 * Picks the theme to load: a valid `?theme=` flag wins, then the deployment's configured
 * default, then {@link defaultClimberThemeId}.
 */
export function resolveClimberThemeId(flag: string | undefined, configured?: string): string {
  if (flag && isThemeId(flag)) return flag;
  if (configured && isThemeId(configured)) return configured;
  return defaultClimberThemeId;
}

/**
 * Frames a Climber theme may add for extra polish; the game works without them.
 * `background-<n>` replaces the background behind summit n; `energy-key` spins on the
 * player's back and `energy-glow` shines behind it, both scaled by energy.
 */
export const climberOptionalFrames = {
  summitBackground: (summitNumber: number) => `background-${summitNumber}`,
  energyKey: 'energy-key',
  energyGlow: 'energy-glow',
} as const;
