/**
 * Builds every theme pack in `themes/` into `dist/themes/<id>/` (atlases at 1x, 2x and 3x
 * plus `theme.manifest.json`). Run by `pnpm build` and before the web app starts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildThemes } from '@teckin/engine-core/art';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const summaries = await buildThemes(
  path.join(packageRoot, 'themes'),
  path.join(packageRoot, 'dist', 'themes'),
);
for (const { manifest, atlasSizes } of summaries) {
  const sizes = Object.entries(atlasSizes)
    .map(([scale, size]) => `${scale}x ${size.width}×${size.height}`)
    .join(', ');
  console.info(
    `Built theme "${manifest.id}": ${Object.keys(manifest.frames).length} frames (${sizes})`,
  );
}
