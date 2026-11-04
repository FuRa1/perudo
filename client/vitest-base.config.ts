import { defineConfig } from 'vitest/config';

// @ionic/core ships a package.json with no "exports" map, and its fesm2022 bundle contains a
// bare directory import ("@ionic/core/components", no filename). Vitest's default SSR behavior
// externalizes node_modules deps and hands them to Node's native (strict) ESM loader, which
// rejects that directory import — `ng build`/`ng serve` never hit this because esbuild's
// app-bundling resolution doesn't apply Node's ESM-only restrictions. Forcing Vitest to inline
// (transform) the Ionic packages instead of externalizing them routes around it.
export default defineConfig({
  test: {
    // Browser-API stubs the unit-test DOM doesn't provide (see the file's own comment) — additive
    // to whatever the Angular unit-test builder sets up for TestBed/zone itself.
    setupFiles: ['src/test-setup.ts'],
    // Node 25+ ships its own global `localStorage`, which shadows jsdom's and is `undefined` unless
    // Node is given a backing file — so on newer Node every spec touching localStorage fails.
    // Turning Node's implementation off restores jsdom's, matching Node 22 behaviour.
    execArgv: ['--no-experimental-webstorage'],
    server: {
      deps: {
        inline: [/@ionic\//],
      },
    },
  },
});
