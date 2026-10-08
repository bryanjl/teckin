// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildThemes } from '@teckin/engine-core/art';
import { findMissingThemeAssets } from '@teckin/engine-core';
import { describe, expect, it } from 'vitest';
import {
  climberOptionalFrames,
  climberThemeRequirements,
  defaultClimberThemeId,
  resolveClimberThemeId,
} from './theme';

const themesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'themes');

describe('Climber theme packs', () => {
  it('every theme folder builds and supplies everything the game draws and names', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'climber-themes-'));
    try {
      const summaries = await buildThemes(themesDir, outDir);
      expect(summaries.map((summary) => summary.manifest.id)).toContain(defaultClimberThemeId);
      for (const { manifest } of summaries) {
        expect(findMissingThemeAssets(manifest, climberThemeRequirements), manifest.id).toEqual([]);
      }
      const cogspire = summaries.find((summary) => summary.manifest.id === 'cogspire')?.manifest;
      expect(cogspire?.names.summitNames[0]).toBe('Boiler Room');
      for (const number of [1, 2, 3, 4, 5, 6]) {
        expect(cogspire?.frames).toHaveProperty(climberOptionalFrames.summitBackground(number));
      }
      expect(cogspire?.frames).toHaveProperty(climberOptionalFrames.energyKey);
      expect(cogspire?.frames).toHaveProperty(climberOptionalFrames.energyGlow);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('resolveClimberThemeId', () => {
  it('prefers a valid flag, then the configured theme, then the default', () => {
    expect(resolveClimberThemeId('cogspire', 'placeholder')).toBe('cogspire');
    expect(resolveClimberThemeId(undefined, 'cogspire')).toBe('cogspire');
    expect(resolveClimberThemeId('../etc', undefined)).toBe(defaultClimberThemeId);
    expect(resolveClimberThemeId(undefined, '')).toBe(defaultClimberThemeId);
  });
});
