import { cp, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { buildThemes } from '@teckin/engine-core/art';

const placeholderDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../games/climber/themes/placeholder',
);

/** Every sprite in the swapped theme is painted this one colour, so it is easy to spot. */
export const swappedSpriteColour = { red: 255, green: 0, blue: 255 } as const;

/** What the swapped theme renames, to check names come from the theme folder. */
export const swappedSummitName = 'Test Peak 1';

/** Built swapped theme: its id and the folder holding its atlases and manifest. */
export interface SwappedTheme {
  id: string;
  builtDir: string;
}

/**
 * Builds a copy of the placeholder theme folder with new names and every sprite recoloured,
 * using the same build the game uses. The game code is untouched: only the folder differs.
 */
export async function buildSwappedTheme(): Promise<SwappedTheme> {
  const id = 'swap-test';
  const workDir = await mkdtemp(path.join(tmpdir(), 'teckin-theme-swap-'));
  const sourceDir = path.join(workDir, 'source', id);
  await cp(placeholderDir, sourceDir, { recursive: true });

  const themeFile = path.join(sourceDir, 'theme.json');
  const theme = JSON.parse(await readFile(themeFile, 'utf8')) as {
    id: string;
    names: { summitNames: string[] };
  };
  theme.id = id;
  theme.names.summitNames = theme.names.summitNames.map((_, index) => `Test Peak ${index + 1}`);
  await writeFile(themeFile, JSON.stringify(theme));

  const spritesDir = path.join(sourceDir, 'sprites');
  for (const file of await readdir(spritesDir)) {
    const spriteFile = path.join(spritesDir, file);
    const svg = await readFile(spriteFile, 'utf8');
    await writeFile(spriteFile, svg.replace(/#[0-9a-f]{3,6}\b/gi, '#ff00ff'));
  }

  const builtRoot = path.join(workDir, 'built');
  await buildThemes(path.dirname(sourceDir), builtRoot);
  return { id, builtDir: path.join(builtRoot, id) };
}

/** Serves the swapped theme from the game's normal theme URL, as if it were deployed. */
export async function serveSwappedTheme(page: Page, theme: SwappedTheme): Promise<void> {
  await page.route(`**/game-assets/climber/themes/${theme.id}/**`, async (route) => {
    const fileName = path.basename(new URL(route.request().url()).pathname);
    try {
      await route.fulfill({ path: path.join(theme.builtDir, fileName) });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}
