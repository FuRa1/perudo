import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.perudo.app',
  appName: 'Perudo',
  webDir: 'dist/client/browser',
  android: {
    // No HTTPS host exists yet (CLAUDE.md section 12), so the native app reaches the game server
    // over plain http/ws on the dev machine (e.g. http://192.168.57.1:3000 from a Genymotion VM).
    // The WebView serves the app from https://localhost, which would otherwise block those calls
    // as mixed content; AndroidManifest.xml's usesCleartextTraffic is the matching OS-level
    // permission. Remove both once the server is behind HTTPS.
    allowMixedContent: true,
  },
};

export default config;
