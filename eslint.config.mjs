import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import gfpA11y from './eslint-rules/gfp-a11y.mjs';

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
    // The React Native apps: every tappable says what it is, every image is
    // either described or marked decorative, and selectable controls expose
    // their state through aria-* props. Screen readers announce the
    // role ("button", "tab", "checkbox"), and on web react-native-web turns it
    // into real semantics; without it a Pressable is an anonymous div.
    // Local rules (eslint-rules/gfp-a11y.mjs) — see problemList.txt AX2.
    // apps/web is Next.js and writes real HTML elements, so it is not covered.
    files: [
      'apps/mobile/**/*.tsx',
      'apps/admin/**/*.tsx',
      'packages/ui/**/*.tsx',
    ],
    plugins: { 'gfp-a11y': gfpA11y },
    rules: {
      'gfp-a11y/pressable-has-role': 'error',
      'gfp-a11y/image-has-alt':      'error',
      'gfp-a11y/switch-has-label':   'error',
      // accessibilityState never reaches the DOM on web; aria-* works everywhere.
      'gfp-a11y/no-accessibility-state': 'error',
      'gfp-a11y/state-matches-role':     'error',
      // Titles are headings (<Heading> from @gfp/ui) so the rotor can find them. AX3.
      'gfp-a11y/title-is-heading':       'error',
    },
  },
  {
    // Text contrast covers apps/web too: its inline style objects set text
    // colours the same way (`color: '#888'`). AX4.
    files: [
      'apps/mobile/**/*.{ts,tsx}',
      'apps/admin/**/*.{ts,tsx}',
      'apps/web/src/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
    ],
    ignores: ['**/__tests__/**'],
    plugins: { 'gfp-a11y': gfpA11y },
    rules: {
      'gfp-a11y/no-low-contrast-text': 'error',
      // Short-lived messages stay 6 s and are announced. AX5.
      'gfp-a11y/no-short-message-timer': 'error',
    },
  },
  {
    // Text fields name themselves: a <Text> label above a field is not read
    // with it (react-native-web exposes the placeholder instead). AX6.
    files: ['apps/mobile/**/*.tsx', 'apps/admin/**/*.tsx', 'packages/ui/**/*.tsx'],
    ignores: ['**/__tests__/**'],
    plugins: { 'gfp-a11y': gfpA11y },
    rules: { 'gfp-a11y/input-has-label': 'error' },
  },
  {
    // Everything EXCEPT packages/shared-types, which owns the direct import.
    files: [
      'apps/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
      'packages/theme/**/*.{ts,tsx}',
    ],
    rules: {
      // Shared schemas are built in packages/shared-types; everywhere else goes
      // through its re-export rather than importing zod directly.
      //
      // This used to guard a live 3-vs-4 split (the root hoisted zod 4 as a
      // transitive dependency of eslint-plugin-react-hooks, while the shared
      // schemas were built on a zod 3 nested under packages/shared-types).
      // That divergence is gone — shared-types is on zod 4 and resolves to the
      // same hoisted copy — but the rule still earns its place. npm can nest a
      // second copy again at any time (a new dependency with a narrower range,
      // and .npmrc sets legacy-peer-deps=true so nothing warns), and two zod
      // instances break `instanceof ZodError`, `.extend()` and `.merge()` just
      // as badly at the SAME major as across two — only now silently, because
      // the versions look compatible. Routing every import through one module
      // makes the question moot regardless of what the tree does.
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'zod',
          message: "Import { z } from '@gfp/shared-types' instead — it re-exports the same zod the shared schemas are built with.",
        }],
      }],
    },
  },
];
