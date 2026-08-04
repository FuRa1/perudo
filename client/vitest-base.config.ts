import { defineConfig } from 'vitest/config';

// @ionic/core ships a package.json with no "exports" map, and its fesm2022 bundle contains a
// bare directory import ("@ionic/core/components", no filename). Vitest's default SSR behavior
// externalizes node_modules deps and hands them to Node's native (strict) ESM loader, which
// rejects that directory import — `ng build`/`ng serve` never hit this because esbuild's
// app-bundling resolution doesn't apply Node's ESM-only restrictions. Forcing Vitest to inline
// (transform) the Ionic packages instead of externalizing them routes around it.
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@ionic\//],
      },
    },
  },
});
