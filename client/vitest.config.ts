import { defineConfig } from 'vitest/config';

// Picked up by the Angular unit-test builder (angular.json → test.options.runnerConfig).
// Ionic ships ESM with directory imports that Node's loader rejects, so Vitest must bundle it.
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@ionic\//, /@stencil\//, /ionicons/],
      },
    },
  },
});
