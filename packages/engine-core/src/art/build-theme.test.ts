// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtThemeManifestSchema } from '../theme/theme-manifest';
import { buildTheme, buildThemes } from './build-theme';

let workDir: string;

interface FixtureTheme {
  id: string;
  title: string;
  fill: string;
}

async function writeFixtureTheme(themesDir: string, theme: FixtureTheme): Promise<void> {
  const dir = path.join(themesDir, theme.id);
  await mkdir(path.join(dir, 'sprites'), { recursive: true });
  await mkdir(path.join(dir, 'ui'), { recursive: true });
  await writeFile(
    path.join(dir, 'theme.json'),
    JSON.stringify({
      id: theme.id,
      displayName: theme.title,
      names: { gameTitle: theme.title, energyWord: 'Power', summitNames: ['One', 'Two'] },
      tokens: { colours: { background: theme.fill }, fontFamily: 'system-ui' },
      spriteVariants: { hero: [{ id: 'red', replace: { [theme.fill]: '#ff0000' } }] },
    }),
  );
  await writeFile(
    path.join(dir, 'sprites', 'hero.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20" fill="${theme.fill}"/></svg>`,
  );
  await writeFile(
    path.join(dir, 'sprites', 'tile.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#00ff00"/></svg>',
  );
  await writeFile(
    path.join(dir, 'ui', 'jump.svg'),
    '<?xml version="1.0"?><!-- icon --><svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>',
  );
}

function pixelAt(image: PNG, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return [...image.data.subarray(offset, offset + 4)];
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'teckin-theme-'));
  await writeFixtureTheme(path.join(workDir, 'themes'), {
    id: 'dawn',
    title: 'Dawn',
    fill: '#0000ff',
  });
  await writeFixtureTheme(path.join(workDir, 'themes'), {
    id: 'dusk',
    title: 'Dusk',
    fill: '#ffff00',
  });
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('buildTheme', () => {
  it('writes a valid manifest with names, tokens, frame sizes, variants and clean UI icons', async () => {
    const outDir = path.join(workDir, 'out', 'dawn');
    const { manifest } = await buildTheme({
      sourceDir: path.join(workDir, 'themes', 'dawn'),
      outDir,
    });
    const written = builtThemeManifestSchema.parse(
      JSON.parse(await readFile(path.join(outDir, 'theme.manifest.json'), 'utf8')),
    );
    expect(written).toEqual(manifest);
    expect(manifest.names.gameTitle).toBe('Dawn');
    expect(manifest.frames).toEqual({
      hero: { width: 10, height: 20 },
      tile: { width: 16, height: 16 },
      'hero-red': { width: 10, height: 20 },
    });
    expect(manifest.ui.jump).toBe('<svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>');
  });

  it('rasterises each scale at that many pixels per world pixel, with recoloured variants', async () => {
    const outDir = path.join(workDir, 'out', 'dawn-scales');
    await buildTheme({ sourceDir: path.join(workDir, 'themes', 'dawn'), outDir, padding: 2 });
    for (const scale of [1, 2, 3]) {
      const data = JSON.parse(
        await readFile(path.join(outDir, `atlas@${scale}x.json`), 'utf8'),
      ) as {
        frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
        meta: { image: string; scale: string };
      };
      expect(data.meta).toMatchObject({ image: `atlas@${scale}x.png`, scale: String(scale) });
      const image = PNG.sync.read(await readFile(path.join(outDir, `atlas@${scale}x.png`)));
      const hero = data.frames.hero!.frame;
      const variant = data.frames['hero-red']!.frame;
      expect([hero.w, hero.h]).toEqual([10 * scale, 20 * scale]);
      expect(pixelAt(image, hero.x + 1, hero.y + 1)).toEqual([0, 0, 255, 255]);
      expect(pixelAt(image, variant.x + 1, variant.y + 1)).toEqual([255, 0, 0, 255]);
      // Padding repeats the edge pixel, so filtering never bleeds a neighbour in.
      expect(pixelAt(image, hero.x - 1, hero.y - 1)).toEqual([0, 0, 255, 255]);
    }
  });

  it('builds every theme folder, and swapping the folder swaps art and names', async () => {
    const outDir = path.join(workDir, 'out', 'all');
    const summaries = await buildThemes(path.join(workDir, 'themes'), outDir);
    expect(summaries.map((summary) => summary.manifest.id)).toEqual(['dawn', 'dusk']);
    const [dawn, dusk] = summaries;
    expect(dawn!.manifest.names.gameTitle).not.toBe(dusk!.manifest.names.gameTitle);
    const dawnAtlas = await readFile(path.join(outDir, 'dawn', 'atlas@1x.png'));
    const duskAtlas = await readFile(path.join(outDir, 'dusk', 'atlas@1x.png'));
    expect(dawnAtlas.equals(duskAtlas)).toBe(false);
  });

  it('rejects a folder whose name does not match its theme id', async () => {
    const themesDir = path.join(workDir, 'mismatch');
    await writeFixtureTheme(themesDir, { id: 'dawn', title: 'Dawn', fill: '#0000ff' });
    await writeFile(
      path.join(themesDir, 'dawn', 'theme.json'),
      (await readFile(path.join(themesDir, 'dawn', 'theme.json'), 'utf8')).replace(
        '"dawn"',
        '"other"',
      ),
    );
    await expect(buildThemes(themesDir, path.join(workDir, 'out', 'mismatch'))).rejects.toThrow(
      /must match its id/,
    );
  });
});
