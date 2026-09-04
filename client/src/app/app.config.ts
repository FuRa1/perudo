import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideLucideConfig } from '@lucide/angular';

import { routes } from './app.routes';
import { loadRequestedFixture } from './core/fixture-loader';

// Zone-based change detection (rather than zoneless) because @ionic/angular's
// component bindings currently assume zone.js.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideIonicAngular(),
    // One consistent stroke-based icon language app-wide (designs/perudo-graphics-spec.dc.html
    // "Icons — Lucide, not generated"): 20px, stroke-width 2.5, colored by currentColor (the
    // package default) so every icon inherits its surrounding text/button color.
    provideLucideConfig({ size: 20, strokeWidth: 2.5 }),
    // Dev-only state-fixture mode (fixture-loader.ts) — blocks first render on this, which is
    // exactly what makes it safe: a requested fixture is applied before Entry ever gets a chance
    // to mount and call SocketService.connect(). A no-op with no `?fixture=` present.
    provideAppInitializer(loadRequestedFixture),
  ],
};
