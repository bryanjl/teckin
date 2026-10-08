import { describe, expect, it } from 'vitest';
import {
  findMissingThemeAssets,
  isThemeId,
  loadThemeManifest,
  themeAtlasUrls,
  type BuiltThemeManifest,
  type ThemeRequirements,
} from './theme-manifest';

const manifest: BuiltThemeManifest = {
  formatVersion: 1,
  id: 'test',
  displayName: 'Test',
  names: { gameTitle: 'Test Climb', energyWord: 'Power', summitNames: ['Low', 'High'] },
  tokens: { colours: { background: '#000000' }, fontFamily: 'system-ui' },
  atlases: {
    '1': { image: 'atlas@1x.png', data: 'atlas@1x.json' },
    '2': { image: 'atlas@2x.png', data: 'atlas@2x.json' },
    '3': { image: 'atlas@3x.png', data: 'atlas@3x.json' },
  },
  frames: { player: { width: 24, height: 32 } },
  ui: { jump: '<svg></svg>' },
};

const requirements: ThemeRequirements = {
  frames: ['player'],
  ui: ['jump'],
  colours: ['background'],
  summitCount: 2,
};

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async (url: string) => {
    fakeFetch.lastUrl = url;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}
fakeFetch.lastUrl = '';

describe('findMissingThemeAssets', () => {
  it('is empty when the theme provides everything', () => {
    expect(findMissingThemeAssets(manifest, requirements)).toEqual([]);
  });

  it('names every missing sprite, icon, colour and summit name', () => {
    const missing = findMissingThemeAssets(manifest, {
      frames: ['player', 'tile'],
      ui: ['pause'],
      colours: ['accent'],
      summitCount: 6,
    });
    expect(missing).toEqual([
      'sprite "tile"',
      'ui icon "pause"',
      'colour token "accent"',
      '6 summit names (has 2)',
    ]);
  });
});

describe('loadThemeManifest', () => {
  it('fetches the manifest from the base URL and resolves atlas URLs', async () => {
    const theme = await loadThemeManifest(
      '/assets/themes/test',
      requirements,
      fakeFetch(200, manifest),
    );
    expect(fakeFetch.lastUrl).toBe('/assets/themes/test/theme.manifest.json');
    expect(theme.manifest.names.gameTitle).toBe('Test Climb');
    expect(themeAtlasUrls(theme, 2)).toEqual({
      image: '/assets/themes/test/atlas@2x.png',
      data: '/assets/themes/test/atlas@2x.json',
    });
  });

  it('rejects a missing manifest, an invalid one and one lacking required assets', async () => {
    await expect(loadThemeManifest('/x/', requirements, fakeFetch(404, {}))).rejects.toThrow(
      /not found/,
    );
    await expect(
      loadThemeManifest('/x/', requirements, fakeFetch(200, { ...manifest, formatVersion: 2 })),
    ).rejects.toThrow();
    await expect(
      loadThemeManifest('/x/', { ...requirements, ui: ['pause'] }, fakeFetch(200, manifest)),
    ).rejects.toThrow(/missing ui icon "pause"/);
  });
});

describe('isThemeId', () => {
  it('accepts kebab-case ids only, so ids cannot leave the themes folder', () => {
    expect(isThemeId('cogspire')).toBe(true);
    expect(isThemeId('sky-islands-2')).toBe(true);
    expect(isThemeId('../secrets')).toBe(false);
    expect(isThemeId('Cogspire')).toBe(false);
    expect(isThemeId('')).toBe(false);
  });
});
