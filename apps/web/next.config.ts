import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next.js compiles them.
  transpilePackages: ['@teckin/climber', '@teckin/game-contracts', '@teckin/ui'],
  poweredByHeader: false,
};

export default nextConfig;
