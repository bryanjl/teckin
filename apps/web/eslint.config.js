import { nextConfig } from '@teckin/config/eslint/next';

export default [
  ...nextConfig,
  {
    // Organisation scoping lives in the data-access layer: pages reach data only through the
    // signed-in host's `organisationData`, never through the raw database client.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/auth.ts', 'src/lib/server/host.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@teckin/db/client',
              message: 'Use requireHost() and its organisation-scoped `data` instead.',
            },
          ],
        },
      ],
    },
  },
];
