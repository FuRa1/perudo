import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideLucideConfig } from '@lucide/angular';

import { routes } from './app.routes';

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
  ],
};
