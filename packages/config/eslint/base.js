// @ts-check
import javascript from '@eslint/js';
import globals from 'globals';
import typescript from 'typescript-eslint';

/**
 * Shared ESLint flat config for every TypeScript package in the monorepo.
 * Packages spread this into their own `eslint.config.js`.
 */
export const baseConfig = typescript.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
    ],
  },
  javascript.configs.recommended,
  ...typescript.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
    },
  },
);

/**
 * ESLint flat config for shared platform packages: the base config plus a rule that stops
 * them importing any game, so the platform stays reusable by every future game.
 */
export const sharedPackageConfig = typescript.config(...baseConfig, {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@teckin/climber', '@teckin/climber/*'],
            message: 'Shared packages must not import from a game.',
          },
        ],
      },
    ],
  },
});

export default baseConfig;
