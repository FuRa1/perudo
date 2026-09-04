# State fixtures (view-layer-from-config) + game save/restore

**Status: §1 (fixture mode) built 2026-09-04. §2 (true save/restore) still just a plan — not
built, pending the user's explicit sign-off (see its own section below).** Originally logged here
as a plan-only doc when the design-parity pass was the immediate priority; the user then asked to
build what was planned, so §1 was implemented. Cross-referenced from `ISSUES.md` and CLAUDE.md
§13 (Future ideas).

The user's ask bundles two things that sound similar ("render different app states from config",
"game save/restore session") but have very different risk profiles against this project's
documented architecture (CLAUDE.md §3.3). Splitting them on purpose.

---

## 1. Fixture / preview mode — client-only, low risk — BUILT 2026-09-04

**Problem it solved:** the only way to get the running app into an interesting state (an
8-player table mid-reveal, the timeout modal, a special round) was to actually play a match
through to that point — `client/e2e/render-states.mjs` does exactly that (drives two-plus real
browser contexts through lobby → roll → bid → call liar just to reach a handful of screenshots).
It works, but every new state to review means scripting a whole new playthrough — the real
bottleneck for a "compare against a design reference, iterate, re-screenshot" loop.

**What shipped:** the UI is now a pure view over `StateSnapshot` when asked to be — a dev-only
`?fixture=<name>` query param, read by `client/src/app/core/fixture-loader.ts` and wired in via
`provideAppInitializer` in `app.config.ts` (so it resolves, populating `GameStore`, _before_ the
app's first render — Entry never mounts for a fixture load, so `SocketService.connect()`, called
from Entry's own constructor, never fires; confirmed live via Playwright: `gameSocket=[]`, zero
console errors, across three different fixture loads).

- Gated exactly like this codebase's existing `?serverUrl=...` override in `SocketService`
  (there's no `environment.ts` split in this project to gate on instead, see `app.config.ts`) —
  no `?fixture=` present is a total no-op, zero behavior change.
- `GameStore.setState()`/`setJoined()`/`applyEvents()` were already public — no store change
  needed, only a new caller.
- Fixture shape: `{ viewerPlayerId, events, snapshot }` — `events` matters because some UI
  (the reveal recap, the timeout modal) is driven by `GameStore`'s ephemeral event-derived
  signals (`lastReveal`, `lastTimeout`, `lastRevealWasSpecialRound`), not by the snapshot alone;
  `events` replay through `applyEvents` _before_ `setState`, matching the server's own real
  "events, then the resulting state, same batch" ordering.
- `client/e2e/capture-fixtures.mjs` captures real fixtures off a live match by reading raw
  WebSocket frames (Playwright `page.on('websocket')`, parsing the socket.io v4 `42[...]` event
  frame format) rather than hand-authoring JSON — accurate by construction. Three fixtures exist
  today under `client/public/assets/fixtures/`: `lobby-2p`, `bidding-mid`, `reveal-true`. Add more
  the same way as new states are worth reviewing (a 12-player table, a special round, a
  disconnect banner, timer phases, …) — the script's structure already shows the pattern.
  `npm run e2e:fixtures -w client` re-captures.
  - `render-states.mjs` gained a `reveal-card-only.png` tight crop specifically for design-parity
    comparisons (2026-09-04 addendum), independent of fixture mode — the two are complementary,
    not the same mechanism: `render-states.mjs` screenshots a real playthrough,
    `capture-fixtures.mjs`/`fixture-loader.ts` let you skip the playthrough entirely once a
    fixture for the state you want already exists.
- **Verified:** `client/src/app/core/fixture-loader.spec.ts` (4 tests: no-op with no param,
  successful load with correct call ordering, a 404, a malformed shape — none of them throw); a
  live Playwright check loading all three fixtures confirmed correct rendering, zero console
  errors, and zero real socket connection. Full repo `lint`/`typecheck`/`test`
  (324: 65 shared + 37 server + 222 client, +4 from this)/`build` all clean; fixture JSON is
  confirmed present in the production build output (`client/dist/client/browser/assets/fixtures/`)
  — harmless (small, static, inert unless the query param is present) but worth being aware of
  given there's no build-time exclusion in this project's current build setup.

**Scope check against CLAUDE.md:** entirely additive on the client; touches no server code, no
`GameEngine`, no persistence. Does not conflict with §3.3.

---

## 2. True game save/restore (survive a server restart) — NOT recommended without sign-off

This is a different feature: persisting an in-progress `MatchState` so it survives the **server**
restarting, not just a player reconnecting to a still-running server (that already exists —
Phase 5's reconnect-by-token, `RoomsService.sessionsByToken`, restores an active player to their
live slot; see CLAUDE.md §7).

**This runs directly against a documented, deliberate decision:**

> §3.3: "Match state lives in server memory... On server restart, active matches are lost — this
> is a **deliberate MVP limitation**; do not add a DB/Redis."

So this is logged here as an **open question for the user** (CLAUDE.md §12 territory), not
something to silently build. If it's ever approved, the smallest-diff shape that stays closest to
the existing "no DB" spirit:

- Serialize `RoomRuntime`'s `MatchState` (+ the reconnect-token map, minus anything that shouldn't
  survive a restart) to a flat JSON file per room under e.g. `server/data/rooms/<roomId>.json` —
  not a database, just a durable snapshot.
- Write on an interval or on each mutation (same serialization queue that already guarantees
  one-at-a-time room mutations, 3.3, would need to also cover the write).
- On boot, `RoomsService` re-hydrates any snapshot files found instead of starting empty.
- Needs an explicit decision on: does a stale/abandoned room snapshot ever get cleaned up (no TTL
  exists today for anything)? Do reconnect tokens survive a restart, or does everyone have to
  re-join? These are exactly the kind of calls CLAUDE.md says only the user closes.

**Not started. Do not implement without the user explicitly approving reversing §3.3.**
