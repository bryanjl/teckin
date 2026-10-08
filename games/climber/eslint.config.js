import { baseConfig } from '@teckin/config/eslint/base';

// Games reach questions only through the GameSession in the shell (spec, Phase 2), so the
// same game code works with a local or a networked session.
export default [
  ...baseConfig,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@teckin/questions',
                '@teckin/questions/*',
                '@teckin/session',
                '@teckin/session/*',
              ],
              message: 'Games use questions only through the GameSession passed in the shell.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests and playtest scripts may build a real LocalSession to drive the game end to end.
    files: ['**/*.test.ts', 'scripts/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
