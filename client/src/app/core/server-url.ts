const SERVER_PORT = 3000;
const STORAGE_KEY = 'perudo.serverUrl';
const QUERY_PARAM = 'server';

/**
 * Where the game server lives. Precedence: `?server=` in the URL (remembered for next time),
 * then the remembered value, then the page's own host on the server port — which covers
 * `ng serve` on localhost and other devices on the LAN opening http://<pc-ip>:4200.
 * A native (Capacitor) build has no meaningful page host, so it needs the explicit override,
 * e.g. `http://10.0.2.2:3000` from the Android emulator.
 */
export function resolveServerUrl(location: Location, storage: Storage): string {
  const fromQuery = new URLSearchParams(location.search).get(QUERY_PARAM);
  if (fromQuery) {
    storage.setItem(STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  const remembered = storage.getItem(STORAGE_KEY);
  if (remembered) {
    return remembered;
  }
  const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${location.hostname}:${SERVER_PORT}`;
}
