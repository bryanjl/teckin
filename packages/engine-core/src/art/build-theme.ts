import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import {
  builtThemeManifestFileName,
  builtThemeManifestSchema,
  themeAssetNamePattern,
  themeSourceSchema,
  themeTextureScales,
  type BuiltThemeManifest,
  type ThemeSource,
  type ThemeTextureScale,
} from '../theme/theme-manifest';
import { packAtlas } from './pack-atlas';

/** Options for {@link buildTheme}. */
export interface BuildThemeOptions {
  /** Theme folder holding `theme.json`, `sprites/` and `ui/`. */
  sourceDir: string;
  /** Output folder. Emptied first, then filled with atlases and the manifest. */
  outDir: string;
  /** Empty, edge-extruded pixels around each frame. */
  padding?: number;
}

/** Summary of a finished theme build. */
export interface BuiltThemeSummary {
  manifest: BuiltThemeManifest;
  /** Atlas size in pixels per texture scale. */
  atlasSizes: Record<ThemeTextureScale, { width: number; height: number }>;
}

interface SpriteFrameSource {
  name: string;
  svg: string;
}

/**
 * Builds one theme folder: validates `theme.json`, expands sprite colour variants,
 * rasterises every sprite at 1x, 2x and 3x, packs each scale into a texture atlas (PNG +
 * Phaser JSON-hash data) and writes `theme.manifest.json` with names, tokens, frame sizes
 * and inlined UI icons.
 */
export async function buildTheme(options: BuildThemeOptions): Promise<BuiltThemeSummary> {
  const { sourceDir, outDir } = options;
  const padding = options.padding ?? 2;
  const source = await readThemeSource(sourceDir);
  const frameSources = expandSpriteVariants(
    source,
    await readSvgFolder(path.join(sourceDir, 'sprites')),
  );
  const ui = await readSvgFolder(path.join(sourceDir, 'ui'));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const frames: BuiltThemeManifest['frames'] = {};
  for (const frame of frameSources) {
    const size = new Resvg(frame.svg, resvgOptions(1)).render();
    frames[frame.name] = { width: size.width, height: size.height };
  }

  const atlasSizes = {} as BuiltThemeSummary['atlasSizes'];
  const atlases = {} as BuiltThemeManifest['atlases'];
  for (const scale of themeTextureScales) {
    const images = frameSources.map((frame) => ({
      name: frame.name,
      image: PNG.sync.read(new Resvg(frame.svg, resvgOptions(scale)).render().asPng()),
    }));
    const packed = packAtlas(
      images.map(({ name, image }) => ({ name, width: image.width, height: image.height })),
      { padding },
    );
    const atlas = new PNG({ width: packed.width, height: packed.height });
    atlas.data.fill(0);
    const atlasFrames: Record<string, unknown> = {};
    for (const placement of packed.placements) {
      const image = images.find((candidate) => candidate.name === placement.name)?.image;
      if (!image) continue;
      blitWithExtrusion(image, atlas, placement.x, placement.y, padding);
      atlasFrames[placement.name] = {
        frame: { x: placement.x, y: placement.y, w: placement.width, h: placement.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: placement.width, h: placement.height },
        sourceSize: { w: placement.width, h: placement.height },
      };
    }
    const imageFile = `atlas@${scale}x.png`;
    const dataFile = `atlas@${scale}x.json`;
    await writeFile(path.join(outDir, imageFile), PNG.sync.write(atlas));
    await writeFile(
      path.join(outDir, dataFile),
      `${JSON.stringify(
        {
          frames: atlasFrames,
          meta: {
            app: '@teckin/engine-core art build',
            version: '1',
            image: imageFile,
            format: 'RGBA8888',
            size: { w: packed.width, h: packed.height },
            scale: String(scale),
          },
        },
        null,
        2,
      )}\n`,
    );
    atlases[String(scale) as '1' | '2' | '3'] = { image: imageFile, data: dataFile };
    atlasSizes[scale] = { width: packed.width, height: packed.height };
  }

  const manifest = builtThemeManifestSchema.parse({
    formatVersion: 1,
    id: source.id,
    displayName: source.displayName,
    names: source.names,
    tokens: source.tokens,
    atlases,
    frames,
    ui: Object.fromEntries(ui.map((icon) => [icon.name, cleanSvgMarkup(icon.svg)])),
  } satisfies BuiltThemeManifest);
  await writeFile(
    path.join(outDir, builtThemeManifestFileName),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { manifest, atlasSizes };
}

/**
 * Builds every theme folder (a folder holding `theme.json`) inside `themesDir` into
 * `<outDir>/<theme id>/`. Returns the summaries in folder-name order.
 */
export async function buildThemes(themesDir: string, outDir: string): Promise<BuiltThemeSummary[]> {
  const entries = await readdir(themesDir, { withFileTypes: true });
  const summaries: BuiltThemeSummary[] = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort(byName)) {
    const sourceDir = path.join(themesDir, entry.name);
    const hasThemeFile = (await readdir(sourceDir)).includes('theme.json');
    if (!hasThemeFile) continue;
    const source = await readThemeSource(sourceDir);
    if (source.id !== entry.name) {
      throw new Error(`Theme folder "${entry.name}" must match its id "${source.id}"`);
    }
    summaries.push(await buildTheme({ sourceDir, outDir: path.join(outDir, source.id) }));
  }
  return summaries;
}

async function readThemeSource(sourceDir: string): Promise<ThemeSource> {
  const raw = await readFile(path.join(sourceDir, 'theme.json'), 'utf8');
  const result = themeSourceSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    throw new Error(`Invalid theme.json in ${sourceDir}: ${result.error.message}`);
  }
  return result.data;
}

async function readSvgFolder(folder: string): Promise<SpriteFrameSource[]> {
  let files: string[];
  try {
    files = await readdir(folder);
  } catch {
    return [];
  }
  const svgFiles = files.filter((file) => file.endsWith('.svg')).sort();
  return Promise.all(
    svgFiles.map(async (file) => {
      const name = file.slice(0, -'.svg'.length);
      if (!themeAssetNamePattern.test(name)) {
        throw new Error(`Art file "${file}" must be named in lower-case kebab-case`);
      }
      return { name, svg: await readFile(path.join(folder, file), 'utf8') };
    }),
  );
}

/** Adds one recoloured frame per declared variant, after the original sprites. */
export function expandSpriteVariants(
  source: Pick<ThemeSource, 'spriteVariants'>,
  sprites: readonly SpriteFrameSource[],
): SpriteFrameSource[] {
  const frames = [...sprites];
  for (const [spriteName, variants] of Object.entries(source.spriteVariants)) {
    const base = sprites.find((sprite) => sprite.name === spriteName);
    if (!base) throw new Error(`spriteVariants names unknown sprite "${spriteName}"`);
    for (const variant of variants) {
      let svg = base.svg;
      for (const [from, to] of Object.entries(variant.replace)) {
        svg = svg.replace(new RegExp(from, 'gi'), to);
      }
      frames.push({ name: `${spriteName}-${variant.id}`, svg });
    }
  }
  return frames;
}

function resvgOptions(scale: number): ConstructorParameters<typeof Resvg>[1] {
  return {
    fitTo: { mode: 'zoom', value: scale },
    // Art carries no text, so skip font discovery: faster and identical on every machine.
    font: { loadSystemFonts: false },
  };
}

/**
 * Copies `image` into `atlas` at (`x`, `y`) and repeats its edge pixels into the
 * surrounding padding, so filtering at frame edges samples the frame's own colours.
 */
function blitWithExtrusion(image: PNG, atlas: PNG, x: number, y: number, padding: number): void {
  for (let row = -padding; row < image.height + padding; row += 1) {
    const sourceRow = Math.min(Math.max(row, 0), image.height - 1);
    for (let column = -padding; column < image.width + padding; column += 1) {
      const sourceColumn = Math.min(Math.max(column, 0), image.width - 1);
      const from = (sourceRow * image.width + sourceColumn) * 4;
      const to = ((y + row) * atlas.width + (x + column)) * 4;
      image.data.copy(atlas.data, to, from, from + 4);
    }
  }
}

/** Drops XML declarations and comments so icons can be inlined into the DOM. */
function cleanSvgMarkup(svg: string): string {
  const cleaned = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (!cleaned.startsWith('<svg')) throw new Error('UI icons must be single <svg> elements');
  if (/<script|\son\w+=/i.test(cleaned)) throw new Error('UI icons must not contain scripts');
  return cleaned;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}
