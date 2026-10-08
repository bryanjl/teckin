/**
 * Copies each registered game's built assets into `public/game-assets/<game id>/`, where
 * the play page tells the game to load them from. Games build their assets with their own
 * `build` script (Turborepo runs it first); this only copies.
 */
import { cp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const games = [{ id: 'climber', packageName: '@teckin/climber' }];

for (const game of games) {
  const packageRoot = path.dirname(require.resolve(`${game.packageName}/package.json`));
  const source = path.join(packageRoot, 'dist');
  try {
    await stat(path.join(source, 'themes'));
  } catch {
    console.error(
      `${game.packageName} has no built assets in ${source}. Run "pnpm build" (or "pnpm --filter ${game.packageName} build") first.`,
    );
    process.exit(1);
  }
  const target = path.join(webRoot, 'public', 'game-assets', game.id);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  console.info(`Copied ${game.packageName} assets to public/game-assets/${game.id}`);
}
