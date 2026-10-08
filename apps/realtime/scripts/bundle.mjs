// Bundles the realtime server and its workspace packages into one ES module for the
// container image (`dist/main.mjs`), so production runs plain Node without tsx or pnpm.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // Optional native speed-ups for `ws` and PM2 metrics; both are skipped when missing.
  external: ['bufferutil', 'utf-8-validate', '@pm2/io'],
  // Some bundled CommonJS packages call `require`, which ES modules do not have.
  banner: {
    js: "import { createRequire as createRequireForBundle } from 'node:module'; const require = createRequireForBundle(import.meta.url);",
  },
  logLevel: 'warning',
});
