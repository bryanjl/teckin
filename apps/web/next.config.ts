import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next.js compiles them.
  transpilePackages: [
    '@teckin/climber',
    '@teckin/db',
    '@teckin/engine-core',
    '@teckin/game-contracts',
    '@teckin/nicknames',
    '@teckin/questions',
    '@teckin/session',
    '@teckin/ui',
  ],
  poweredByHeader: false,
  // The deploy workflow sets NEXT_OUTPUT=standalone to get a self-contained server for App
  // Service. Local runs and E2E keep the default output so `next start` works as usual.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: repositoryRoot }
    : {}),
};

export default nextConfig;
