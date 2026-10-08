import { isThemeId, type ThemeRequirements } from '@teckin/engine-core';

/** Theme used when none is chosen. Cogspire replaces it in M2.4. */
export const defaultClimberThemeId = 'placeholder';

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
