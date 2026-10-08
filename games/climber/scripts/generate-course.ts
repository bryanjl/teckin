/**
 * Writes the course layout to `maps/course.json` as a Tiled map.
 * Run with `pnpm --filter @teckin/climber generate:course` after changing the layout.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCourseTiledMap } from '../src/course/course-layout';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(packageRoot, 'maps', 'course.json');
await writeFile(target, `${JSON.stringify(buildCourseTiledMap(), null, 1)}\n`);
console.info(`Wrote ${path.relative(process.cwd(), target)}`);
