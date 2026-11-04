import { inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { ServerEvent, StateSnapshot } from '@shared';
import { GameStore } from './game-store';

/**
 * Dev-only "state fixture" mode (STATE_FIXTURES_AND_SAVE_PLAN.md) — lets any screen be rendered
 * directly from a captured `StateSnapshot` instead of playing a full match through Socket.io
 * first. Purely additive: touches no server code, no GameEngine, no persistence (contrast with
 * the plan doc's other, NOT-built half — true save/restore across a server restart, which would
 * reverse CLAUDE.md §3.3's "no DB" decision and needs explicit sign-off first).
 *
 * Gated the same way this codebase already gates dev/test overrides — an explicit query param,
 * same pattern as SocketService's `?serverUrl=...` — rather than an environment.ts split (this
 * project has none; see app.config.ts). No `?fixture=` present is a total no-op: zero behavior
 * change for every normal load.
 *
 * Fixture JSON lives at `public/assets/fixtures/<name>.json`, shape: `{ viewerPlayerId, events,
 * snapshot }`. `events` replays through `GameStore.applyEvents` *before* `setState` — matching
 * the real server's own "events, then the resulting state, same batch" ordering (see
 * GameStore.applyEvents's own doc comment on why that order matters for e.g.
 * `lastRevealWasSpecialRound`). Capture real fixtures off a live match with
 * `client/e2e/capture-fixtures.mjs` rather than hand-authoring — see that script's header.
 */
interface StateFixture {
  readonly viewerPlayerId: string;
  readonly events: readonly ServerEvent[];
  readonly snapshot: StateSnapshot;
}

function isStateFixture(value: unknown): value is StateFixture {
  const v = value as Partial<StateFixture> | null;
  return (
    !!v &&
    typeof v.viewerPlayerId === 'string' &&
    Array.isArray(v.events) &&
    typeof v.snapshot === 'object' &&
    v.snapshot !== null
  );
}

/**
 * Where the requested fixture lives, if any:
 * - `?fixture=<name>` — a bundled fixture, `public/assets/fixtures/<name>.json`;
 * - `?fixtureSrc=<url>` — any JSON URL (e.g. a state generated on the dev machine);
 * - native builds have no address bar, so the same two parameters are read from the deep link the
 *   app was launched with: `perudo://fixture?src=<url>` or `perudo://fixture?name=<name>`
 *   (used by `client/e2e/device-render.mjs` to render a state on every running emulator).
 */
async function requestedFixtureUrl(): Promise<string | null> {
  const query = new URLSearchParams(window.location.search);
  const params = Capacitor.isNativePlatform() ? await launchUrlParams() : query;
  const src = params.get('fixtureSrc') ?? params.get('src');
  if (src) {
    return src;
  }
  const name = params.get('fixture') ?? params.get('name');
  return name ? `/assets/fixtures/${encodeURIComponent(name)}.json` : null;
}

async function launchUrlParams(): Promise<URLSearchParams> {
  const launch = await App.getLaunchUrl();
  if (!launch?.url.startsWith('perudo://fixture')) {
    return new URLSearchParams();
  }
  return new URL(launch.url.replace('perudo://', 'https://perudo.invalid/')).searchParams;
}

/** Registered via `provideAppInitializer` (app.config.ts) so it resolves — populating GameStore,
 * when a fixture is requested — before the app's first render. That ordering is load-bearing: it
 * means Entry never mounts for a fixture load, so SocketService.connect() (called from Entry's
 * constructor) never fires and no real connection is attempted. */
export async function loadRequestedFixture(): Promise<void> {
  // inject() only works synchronously inside the initializer — before the first await.
  const store = inject(GameStore);
  const fixtureUrl = await requestedFixtureUrl();
  if (!fixtureUrl) {
    return;
  }
  const res = await fetch(fixtureUrl);
  if (!res.ok) {
    console.error(`[fixture] "${fixtureUrl}" not found (${res.status}) — continuing without one.`);
    return;
  }
  const fixture: unknown = await res.json();
  if (!isStateFixture(fixture)) {
    console.error(`[fixture] "${fixtureUrl}" doesn't match the expected shape — ignoring it.`);
    return;
  }
  store.setJoined(fixture.viewerPlayerId);
  store.applyEvents(fixture.events);
  store.setState(fixture.snapshot);
  store.setConnected(true);
}
