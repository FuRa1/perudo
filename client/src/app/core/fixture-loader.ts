import { inject } from '@angular/core';
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

/** Registered via `provideAppInitializer` (app.config.ts) so it resolves — populating GameStore,
 * when a fixture is requested — before the app's first render. That ordering is load-bearing: it
 * means Entry never mounts for a fixture load, so SocketService.connect() (called from Entry's
 * constructor) never fires and no real connection is attempted. */
export async function loadRequestedFixture(): Promise<void> {
  const name = new URLSearchParams(window.location.search).get('fixture');
  if (!name) {
    return;
  }
  const store = inject(GameStore);
  const res = await fetch(`/assets/fixtures/${encodeURIComponent(name)}.json`);
  if (!res.ok) {
    console.error(`[fixture] "${name}" not found (${res.status}) — continuing without one.`);
    return;
  }
  const fixture: unknown = await res.json();
  if (!isStateFixture(fixture)) {
    console.error(`[fixture] "${name}.json" doesn't match the expected shape — ignoring it.`);
    return;
  }
  store.setJoined(fixture.viewerPlayerId);
  store.applyEvents(fixture.events);
  store.setState(fixture.snapshot);
  store.setConnected(true);
}
