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
    '@teckin/room-core',
    '@teckin/session',
    '@teckin/ui',
  ],
  poweredByHeader: false,
  // Baseline headers on every response; the player pages add a strict CSP in src/proxy.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // Browsers ignore this over plain HTTP, so local network play is unaffected.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
    ];
  },
  experimental: {
    // A full question set (up to 500 questions) is saved in one server action call.
    serverActions: { bodySizeLimit: '2mb' },
  },
  // The deploy workflow sets NEXT_OUTPUT=standalone to get a self-contained server for App
  // Service. Local runs and E2E keep the default output so `next start` works as usual.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: repositoryRoot }
    : {}),
};

export default nextConfig;
