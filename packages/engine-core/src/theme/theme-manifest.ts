import { z } from 'zod';

/**
 * A theme pack is a folder:
 *
 * - `theme.json`: id, display name, names (game title, energy word, summit names) and
 *   design tokens (colours, font stack). Validated by {@link themeSourceSchema}.
 * - `sprites/*.svg`: in-world art, rasterised into texture atlases at 1x, 2x and 3x.
 * - `ui/*.svg`: interface icons, kept as SVG markup for crisp DOM buttons at any density.
 *
 * The art build turns the folder into a built theme (atlases plus
 * `theme.manifest.json`, see {@link builtThemeManifestSchema}) that the game loads at
 * runtime, so swapping the folder swaps every picture and name without code changes.
 */

const hexColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colours are six-digit hex values such as #1e293b');

/** Lower-case kebab-case, used for theme ids, frame names and variant ids. */
export const themeAssetNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assetName = z.string().regex(themeAssetNamePattern, 'Use lower-case kebab-case names');

/** Names shown to players. Kept out of the art so the game can be translated later. */
export const themeNamesSchema = z.object({
  gameTitle: z.string().min(1),
  /** What the theme calls energy, e.g. "Wind-up". */
  energyWord: z.string().min(1),
  /** One name per summit, bottom to top. */
  summitNames: z.array(z.string().min(1)).min(1),
});

/** Design tokens for HUD, overlays and the scene background. */
export const themeTokensSchema = z.object({
  colours: z.record(assetName, hexColour),
  /** CSS font-family stack. System fonts only unless a licensed font ships with the theme. */
  fontFamily: z.string().min(1),
});

/**
 * One recoloured copy of a sprite. Every `replace` key found in the SVG (case-insensitive)
 * is swapped for its value, so variants are hue swaps of a single drawing.
 */
export const spriteVariantSchema = z.object({
  id: assetName,
  replace: z.record(hexColour, hexColour),
});

/** Shape of `theme.json` in a theme folder. */
export const themeSourceSchema = z.object({
  id: assetName,
  displayName: z.string().min(1),
  names: themeNamesSchema,
  tokens: themeTokensSchema,
  /** Recoloured copies per sprite name; frame names become `<sprite>-<variant id>`. */
  spriteVariants: z.record(assetName, z.array(spriteVariantSchema).min(1)).default({}),
});

/** Parsed `theme.json`. */
export type ThemeSource = z.infer<typeof themeSourceSchema>;

/** Texture resolutions the art build produces. */
export const themeTextureScales = [1, 2, 3] as const;

/** One of {@link themeTextureScales}. */
export type ThemeTextureScale = (typeof themeTextureScales)[number];

const atlasFilesSchema = z.object({
  /** Atlas image file name, relative to the theme's base URL. */
  image: z.string().min(1),
  /** Phaser JSON-hash atlas data file name, relative to the theme's base URL. */
  data: z.string().min(1),
});

/** Shape of the built `theme.manifest.json` that the game loads. */
export const builtThemeManifestSchema = z.object({
  formatVersion: z.literal(1),
  id: assetName,
  displayName: z.string().min(1),
  names: themeNamesSchema,
  tokens: themeTokensSchema,
  atlases: z.object({ '1': atlasFilesSchema, '2': atlasFilesSchema, '3': atlasFilesSchema }),
  /** Every frame in the atlases with its size in world pixels (the SVG's own size). */
  frames: z.record(
    z.string(),
    z.object({ width: z.number().positive(), height: z.number().positive() }),
  ),
  /** Interface icons as SVG markup, keyed by file name without extension. */
  ui: z.record(assetName, z.string().min(1)),
});

/** Parsed `theme.manifest.json`. */
export type BuiltThemeManifest = z.infer<typeof builtThemeManifestSchema>;

/** File name of the built manifest inside a built theme folder. */
export const builtThemeManifestFileName = 'theme.manifest.json';

/** Assets a game needs from any theme it is given. */
export interface ThemeRequirements {
  /** Atlas frame names. */
  frames: readonly string[];
  /** UI icon names. */
  ui: readonly string[];
  /** Colour token names. */
  colours: readonly string[];
  /** Least number of summit names. */
  summitCount: number;
}

/**
 * Lists what `manifest` lacks compared with `requirements`, as readable messages. An empty
 * list means the theme can be used. Checked by tests at build time and by the loader.
 */
export function findMissingThemeAssets(
  manifest: Pick<BuiltThemeManifest, 'frames' | 'ui' | 'tokens' | 'names'>,
  requirements: ThemeRequirements,
): string[] {
  const missing: string[] = [];
  for (const frame of requirements.frames) {
    if (!(frame in manifest.frames)) missing.push(`sprite "${frame}"`);
  }
  for (const icon of requirements.ui) {
    if (!(icon in manifest.ui)) missing.push(`ui icon "${icon}"`);
  }
  for (const colour of requirements.colours) {
    if (!(colour in manifest.tokens.colours)) missing.push(`colour token "${colour}"`);
  }
  if (manifest.names.summitNames.length < requirements.summitCount) {
    missing.push(
      `${requirements.summitCount} summit names (has ${manifest.names.summitNames.length})`,
    );
  }
  return missing;
}

/** A built theme ready to load, with absolute URLs resolved against its base URL. */
export interface LoadedTheme {
  manifest: BuiltThemeManifest;
  /** Base URL of the built theme folder, ending in `/`. */
  baseUrl: string;
}

/**
 * Fetches and validates a built theme's manifest from `baseUrl`, and checks it provides
 * everything in `requirements`. Throws a readable error when the theme is unusable.
 */
export async function loadThemeManifest(
  baseUrl: string,
  requirements: ThemeRequirements,
  fetchFunction: typeof fetch = fetch,
): Promise<LoadedTheme> {
  const normalisedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const response = await fetchFunction(`${normalisedBaseUrl}${builtThemeManifestFileName}`);
  if (!response.ok) {
    throw new Error(`Theme manifest not found at ${normalisedBaseUrl} (${response.status})`);
  }
  const manifest = builtThemeManifestSchema.parse(await response.json());
  const missing = findMissingThemeAssets(manifest, requirements);
  if (missing.length > 0) {
    throw new Error(`Theme "${manifest.id}" is missing ${missing.join(', ')}`);
  }
  return { manifest, baseUrl: normalisedBaseUrl };
}

/** Absolute URLs of the atlas image and data for one texture scale. */
export function themeAtlasUrls(
  theme: LoadedTheme,
  scale: ThemeTextureScale,
): { image: string; data: string } {
  const files = theme.manifest.atlases[String(scale) as '1' | '2' | '3'];
  return { image: `${theme.baseUrl}${files.image}`, data: `${theme.baseUrl}${files.data}` };
}

/** True for a usable theme id (kebab-case), so query-string ids cannot escape the theme folder. */
export function isThemeId(value: string): boolean {
  return themeAssetNamePattern.test(value);
}
