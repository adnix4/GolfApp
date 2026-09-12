import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.next/**',
      '**/build/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/babel.config.js',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.es2020,
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks':        reactHooks,
    },
    rules: {
      'no-undef':       'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'no-console': 'off',

      // React's hook order is positional: every render has to reach the same
      // hooks in the same order. A hook below an early return breaks that, and
      // neither tsc nor the test suite can see it — this rule is what catches
      // it. See #56, where a hook under the scorecard's loading guard crashed
      // the scorer with "Rendered more hooks than during the previous render".
      'react-hooks/rules-of-hooks': 'error',

      // Advisory for now: no hook in this repo has ever been checked for a
      // stale closure, and several effects narrow their deps deliberately.
      // Warnings surface in CI without failing it — promote to 'error' only
      // after the existing reports have been triaged.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Everything EXCEPT packages/shared-types, which owns the direct import.
    files: [
      'apps/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
      'packages/theme/**/*.{ts,tsx}',
    ],
    rules: {
      // zod 4 is hoisted to the workspace root as a transitive dependency of
      // eslint-plugin-react-hooks, while every shared schema is built with the
      // zod 3 nested under packages/shared-types. A direct import here resolves
      // to the root copy, and the moment one of those schemas is merged or
      // extended with a locally-built one, two incompatible majors of the same
      // validator meet — at runtime and in the types.
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'zod',
          message: "Import { z } from '@gfp/shared-types' instead — it re-exports the same zod the shared schemas are built with.",
        }],
      }],
    },
  },
];
