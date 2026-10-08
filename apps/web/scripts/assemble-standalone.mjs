/**
 * Turns a standalone Next.js build (`NEXT_OUTPUT=standalone pnpm build`) into one folder that
 * App Service can run with `node apps/web/server.js`: the traced server, the hashed static
 * files and `public/` (including the game assets). Install with
 * `--config.node-linker=hoisted` first: pnpm's default symlinked layout does not survive the
 * standalone trace plus a zip deploy, while a hoisted one gives plain folders.
 */
import { cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(webRoot, '.next', 'standalone');
const target = path.join(webRoot, '.deploy');

try {
  await stat(path.join(standalone, 'apps', 'web', 'server.js'));
} catch {
  console.error('No standalone build found. Run "NEXT_OUTPUT=standalone pnpm build" first.');
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await cp(standalone, target, { recursive: true, dereference: true });
await cp(
  path.join(webRoot, '.next', 'static'),
  path.join(target, 'apps', 'web', '.next', 'static'),
  {
    recursive: true,
  },
);
await cp(path.join(webRoot, 'public'), path.join(target, 'apps', 'web', 'public'), {
  recursive: true,
});
console.info(`Assembled the App Service package in ${path.relative(process.cwd(), target)}`);
