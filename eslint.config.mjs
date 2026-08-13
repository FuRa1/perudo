// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Single ESLint config for the whole monorepo (CLAUDE.md 4.1) — one ruleset,
// scoped per package via `files`, instead of a config per package.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/out-tsc/**',
      'client/public/**',
      'eslint.config.mjs',
    ],
  },
  eslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // /shared — pure TS, consumed by both client and server.
  {
    files: ['shared/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['shared/src/**/*.spec.ts'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },

  // /server — NestJS, Node + Jest.
  {
    files: ['server/src/**/*.ts', 'server/test/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },
  {
    files: ['server/src/**/*.spec.ts', 'server/test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },

  // /client — Angular 21, browser + Vitest.
  {
    files: ['client/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['client/src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },

  // client/e2e — plain Node scripts driving `playwright` directly (no @playwright/test, no
  // Angular). Browser globals are needed too: `page.evaluate`/`page.addInitScript` callback
  // bodies run inside the browser page, not this Node process, but they're authored inline in
  // this same file, so ESLint statically sees `window`/`document`/`navigator` here as well.
  {
    files: ['client/e2e/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
