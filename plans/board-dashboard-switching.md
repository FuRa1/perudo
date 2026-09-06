# Swappable board dashboards — Default / Clockwise / Linear

## Context

`designs/perudo-spotlight-gallery.dc.html` is an **experimental** concept file (labelled "TURN-ORDER
GALLERY · CONCEPT", separate from and not yet part of the canonical
`perudo-mobile-consolidated.dc.html`). It explores a different way to arrange a live table: whoever
is bidding sits large and lit in the centre — "the spotlight" — and everyone else waits in turn
order around them. Two arrangements, each drawn at 4 and 12 players:

- **Variant A "Below deck"** (`A-4P`/`A-12P`) — waiting players in a horizontal scrollable rail
  along the bottom, spotlight centred above. Scales by scrolling, not shrinking: a card stays
  62–88px at any player count, with a `+N more` counter and a right-edge fade past five cards.
- **Variant B "Round the table"** (`B-4P`/`B-12P`) — waiting players on an ellipse ring around the
  spotlight, so turn order *is* the circle and clockwise needs no label.

The goal is to **experiment with these live**, not commit to one. Keep the current board as
`Default`, add `Clockwise` (Variant B) and `Linear` (Variant A), and cycle between them with one
button — the gallery's own `↻ Clockwise` pill, repurposed from a decorative turn-direction label
into the switcher itself. The button always shows the **next** layout, never the current one:
`Clockwise` → tap → now on Clockwise, button reads `Linear` → tap → now on Linear, button reads
`Default` → tap → back to Default. Three layouts, fixed cycle, no dropdown.

The blocker today is that `features/table/table.ts` renders *everything* in one component — header,
opponent arc, hand, wager token, reveal, bid sheet, loss modal — so there is no seam to swap a
layout at. Most of this work is creating that seam without changing how Default looks.

**These are new layouts and they are allowed new view logic.** Where the canonical design's rules
were written for the single existing board (notably "`ArcSeat` is never rendered for the local
player", §5), they are not binding on Clockwise/Linear. `CLAUDE.md` should gain a short section
describing dashboard switching once this lands.

## Decisions

1. **No Angular Router** — a signal-driven `@switch`. (The app has never used routing;
   `app.routes.ts` is `[]` and every screen is an `@if` on a `GameStore` signal in `app.html`.)
2. **Dashboard = opponent seating + your own seat + your hand.** Header/timer/switcher, wager token,
   reveal panel, `RoundLossModal` and `BidControls` are **shell**: rendered once, identical across
   all three layouts.
3. **State in `@ngrx/signals` (SignalStore)** — NgRx by name, but signals-native, so no RxJS state
   idiom is introduced alongside a 100%-signals codebase. First NgRx package in this repo.
4. **Persist to `localStorage` now**, following `SocketService`'s key/guarded-read style. One key, a
   placeholder for a real user-settings feature later — not a settings framework.
5. **Switcher lives in the shell header**, inline, not fixed-position and not repeated per
   dashboard. Per-dashboard would mean three copies each injecting `LayoutStore`, breaking decision
   2. Fixed-position works but the bid sheet is already `position: fixed` and the reveal scrim and
   `RoundLossModal` both sit above the board — a fourth floating layer is a z-index order to
   maintain forever for a button that has a home. The header is shell, already holds the round chip
   and timer, and is where the gallery draws the pill. Reversible in one CSS rule if it feels
   cramped once the new layouts are real.
6. **You get a seat in the new layouts**, same size as everyone else's, filled **terracotta
   (`C-03`)** against opponents' translucent cream — the role colouring §0.2 already defines as
   "this is yours" and already uses for the lobby roster avatar. Your five dice stay in the bottom
   hand zone regardless. Terracotta fill and the active-bidder brass halo are different channels, so
   a seat can be yours *and* bidding with no ambiguity.
7. **Player-count scaling is formula-driven, not breakpointed** — ring radius, seat size and dimming
   are continuous functions of `count` (seat size easing toward the 30px floor, opacity falling with
   angular distance from the light), so 7 players looks correctly in-between rather than snapping at
   a threshold.
8. **Clockwise ships static first; rotation is Phase 4.** Seats are placed on the ring and positions
   simply recompute when the turn changes. This gets real player counts on screen before committing
   to a motion model.
9. **Default is touched as little as possible, and duplication between dashboards is accepted.**
   Default is the working board; the new layouts are the experiment. So: the dead `hidden`
   `SeatCard`/`OpeningRollPanel` branches move into `DefaultDashboard` **unchanged** rather than
   being cleaned up, shared logic is extracted only where the shell genuinely forces it (see
   `GameView` below), and Linear/Clockwise are free to duplicate rather than abstract. Revisit when
   the bid controls move to a slider.
10. **The spotlight card reuses what exists wherever it can.** Try `ArcSeat` with a larger size
    variant first; only if its 84px-tile internals genuinely fight a 250px hero does it become a thin
    `SpotlightCard` composing the same `Die`/`BidMarker`/identity-tile parts. Reuse is the default,
    not a constraint on making it look right.

## Ring implementation — no library

The math is four lines: `x = cx + rx·cos θ`, `y = cy + ry·sin θ`, with `θᵢ = start + (i/count)·2π`.
`computeArcPosition` already does the same shape of thing with `Math.sin(Math.PI · x)`. Surveyed
alternatives and rejected all of them: the `ngx-circular-*` / radial-menu packages are menu-focused,
largely unmaintained, and would fight the token system; D3's `d3-shape`/`d3-scale` are maintained but
it is a data-viz toolkit, a large dependency to place twelve divs on an ellipse. CSS
`offset-path` + `offset-distance` is the one genuinely elegant native primitive — it places *and*
animates along a path with no JS math — and is worth revisiting in Phase 4, but `offset-path` with
basic shapes like `ellipse()` landed later than `path()` and this ships inside Capacitor WebViews, so
it is not what I would bet the layout on. Computed `transform: translate()` plus a CSS transition is
universally supported and gets the same result.

When rotation arrives in Phase 4, the two models are: **the ring rotates** (all seats hold fixed
slots, the container rotates so the active bidder always lands at one screen position, each seat
counter-rotating to stay upright — one animated property, but everyone's on-screen position changes
each turn), or **seats move between slots** (the gallery's literal drawing — N simultaneous
transitions, players stay recognisably in place). Decide with the static ring on screen.

## Dependency — pin the version, do not install latest

```
"@ngrx/signals": "^21.1.1"     // client/package.json dependencies
```

**`@ngrx/signals@latest` is 22.0.0 and requires `@angular/core: ^22.0.0`** — this repo is on
`^21.2.0`, so a bare `npm install @ngrx/signals` produces a peer conflict. Verified: `21.1.1` needs
`@angular/core: ^21.0.0` + `rxjs: ^6.5.3 || ^7.4.0` against this repo's `^21.2.0` / `~7.8.0`. Clean,
with `tslib` as its only runtime dependency. No `app.config.ts` change — a `signalStore()` with
`{ providedIn: 'root' }` injects exactly like `GameStore`.

## Structure

`features/table/` becomes `features/board/`. `Table` is renamed `BoardShell` — it is no longer "the
table", it is the frame around a swappable one. The diff is large but almost entirely mechanical
moves; git tracks the renames.

```
core/
  layout.store.ts  .spec.ts        NEW  SignalStore: activeLayout + cycleLayout()
  game-view.ts     .spec.ts        NEW  shared state→text/flag derivations
features/board/
  board-shell/                     NEW  renamed Table: header+switcher, bid sheet, modal, @switch
  seat-geometry.ts .spec.ts        NEW  extracted arc geometry + new computeRingPosition
  dashboards/dashboard-registry.ts NEW  id/label/order — one source of truth for the cycle
  dashboards/default-dashboard/    NEW  today's arc, verbatim
  dashboards/linear-dashboard/     NEW  placeholder in P1, real in P2
  dashboards/clockwise-dashboard/  NEW  placeholder in P1, real in P3
features/local-hand-zone/          NEW  your hand + roll button, self-contained
ui/wager-token/                    NEW  extracted, input()-driven
ui/mobile-reveal-panel/            NEW  extracted, input()-driven
ui/arc-seat/arc-seat.ts            MODIFIED  + isLocalPlayer input (terracotta fill)
features/table/                    DELETED at the end of Phase 1
features/game-board-mobile/game-board-mobile.ts   MODIFIED  <app-table/> → <app-board-shell/>
```

**Three kinds of logic come out of `table.ts`, and they go to different places:**

- **Pure geometry** → `seat-geometry.ts`: `computeArcPosition`, `seatSizeFor`, `CARD_GAP_PX`,
  `ARC_TOP_PADDING_PX`, `MOBILE_ARC_*`. Currently module-private and unexported, which is exactly
  why no second layout can reuse them. Move the doc comments too — they record real clipping and
  scroll bugs a future reader still needs. `computeRingPosition` joins them in Phase 3.
- **Only what the shell now needs** → a small `GameView` service (`providedIn: 'root'`, injects
  `GameStore`). The shell takes ownership of the wager token and reveal panel, so their data has to
  come from somewhere: `nicknameFor`, `wagerCaptionFor`, `latestBidRecord`, `mobilePhaseLabel`,
  `revealRows`, `revealOutcomeText`, `revealLossSentence`, `nextRoundSummary`. **Nothing else moves.**
  An earlier draft extracted all ~18 helpers on the theory that three dashboards would share them;
  that is over-extraction under the "touch Default as little as possible, some duplication is fine"
  rule — Linear and Clockwise duplicate what they need when they are actually built, and only a
  helper that has genuinely proven itself shared gets promoted here later.
- **Layout-specific arrangement** → stays in `DefaultDashboard`: `isArcStressCase`,
  `frontArcOpponents`/`backArcOpponents`, `mobileArcHeightPx`, `arcMinWidthPx`. A ring and a rail
  won't share these.

**`LayoutStore` + registry.** `dashboard-registry.ts` holds `[{ id, label }]` in cycle order as the
single source of truth, so adding a fourth experimental layout is one array entry plus one `@case`.
The template stays a static `@switch` rather than `NgComponentOutlet` — full compile-time type
checking, and content projection into a dynamically-loaded component is more awkward than the
indirection is worth at three layouts.

```ts
export type BoardLayout = 'default' | 'clockwise' | 'linear';
const LAYOUT_STORAGE_KEY = 'perudo:boardLayout';   // matches socket.service.ts's convention

export const LayoutStore = signalStore(
  { providedIn: 'root' },
  withState<{ activeLayout: BoardLayout }>({ activeLayout: 'default' }),
  withComputed((s) => ({ nextLayoutLabel: computed(() => labelOf(nextOf(s.activeLayout()))) })),
  withMethods((s) => ({
    cycleLayout(): void { /* advance via registry order, patchState, guarded localStorage write */ },
  })),
  withHooks({ onInit: (s) => patchState(s, { activeLayout: readStoredLayout() }) }),
);
```

`cycleLayout()` is the **only** public mutator — no arbitrary setter, because the product decision is
a fixed cycle with no dropdown. `readStoredLayout()` falls back to `'default'` on missing, malformed
or unknown values, in a `try/catch` (matching `SocketService`, which has no SSR guard either).

The switcher button is **inlined in `board-shell.html`** — a plain `<button type="button">` (not
`<ion-button>`, whose chrome fights the pill spec) in the header row beside the phase chip and
`<app-turn-timer>`: an icon plus `layoutStore.nextLayoutLabel()` with
`(click)="layoutStore.cycleLayout()"`. A component for that would be ceremony; the phase chip next
to it is inlined for the same reason.

**Wager token and reveal panel use content projection.** Decision 2 says they render identically in
every layout, but in the current design they sit *between* the arc and the hand zone in DOM order —
they can't just be shell-level siblings after the `@switch` without changing Default's layout. So
each dashboard declares `<ng-content select="[wagerSlot]" />` / `<ng-content select="[revealSlot]" />`
wherever its own composition wants them, and `BoardShell` passes one canonical instance of each into
whichever dashboard is active.

> **`DefaultDashboard` must use `:host { display: contents }`**, not the `display: block` every other
> component here uses. `.mobile-hand-zone { margin-top: auto }` (table.scss:227) and the flex `gap-3`
> rhythm require the arc / wager / hand / reveal to be **direct children** of
> `.table-layout__main`'s flex column. A normal block host breaks all of it with no build, lint or
> type error — a purely visual regression. This is the single easiest thing to get wrong in Phase 1.

## Phases

Each ends lint-clean, type-clean, tests-green, per CLAUDE.md §4.4.

**Phase 0 — design pass on the gallery (parallel, blocks nothing).** Write
`designs/perudo-spotlight-gallery-pass2-claude-prompt.md` and hand it to Claude Design. Two jobs:
shrink the hero card, which is too large for what it carries; and decide whether the `your seat in N`
chip survives now that the local player has a real seat in the rail. Brief is explicitly "80% quick"
— no new token system, no full-fidelity redraw. Feeds Phase 2/3 but does not gate Phase 1.

**Phase 1 — pure refactor, zero visual change.** Add the dependency; extract `seat-geometry.ts`,
`GameView`, `LayoutStore` + registry, `LocalHandZone`, `WagerToken`, `MobileRevealPanel`; create
`DefaultDashboard` (today's arc markup verbatim) and *placeholder* Linear/Clockwise dashboards that
render a "coming soon" line plus `<app-local-hand-zone/>` and both projected slots — so the game
stays fully playable on any of the three selections from day one; rename `Table` → `BoardShell`;
repoint `game-board-mobile.ts`; delete `features/table/`. Re-home the 28 tests in `table.spec.ts`
(11 describe blocks) to whichever component now owns the markup they assert on. Add unit specs for
`seat-geometry`, `GameView` and `LayoutStore` — geometry in particular was only ever covered
indirectly through `Table` before.

This is the risky phase: it touches the most working code and delivers no visible feature.

**Phase 2 — Linear (Variant A) for real.** Before Clockwise, because it is the gallery's own
recommended default, it is structurally closest to what exists (`.mobile-arc-wrap` is already an
`overflow-x-auto` scroller, `ArcSeat` already a fixed-size tile), and it gives a second working
reference point before harder geometry. Spotlight above a horizontal rail in turn order, built from
`<app-arc-seat>` rather than new seat markup, with your own terracotta seat in the rail, the
`+N more` counter and the right-edge fade. Scope: `BIDDING` phase, 2–12 players, no animation yet.
Adds `isLocalPlayer` to `ArcSeat` (additive; `DefaultDashboard` never passes it, so Default is
untouched).

**Phase 3 — Clockwise (Variant B) for real.** `computeRingPosition()` in `seat-geometry.ts`, seats
placed on an ellipse with the spotlight centred, your terracotta seat among them, radius/size/dimming
as continuous functions of player count. Static — positions recompute on turn change, nothing
animates yet. Same `BIDDING`-only scope as Phase 2.

**Phase 4 — motion.** Pick a rotation model with the static ring in front of you (see above), then
add the gallery's handoff choreography (outgoing card holds ~300ms, travels ~380ms to the back of
the queue; incoming starts 80ms before it lands so the centre is never empty; queue closes with a
40ms stagger). Needs a `prefers-reduced-motion` path — the codebase already has that precedent in
`loader.scss:30` and `turn-timer.scss:53`.

**Phase 5 — docs.** Add a section to `CLAUDE.md` describing dashboard switching, and note in
`ISSUES.md` that the spotlight layouts are experimental and not yet reconciled with the canonical
design file.

## Edge cases — resolved

- **Non-bidding phases.** `LOBBY` and `GAME_OVER` never mount the board at all (`app.html` routes
  them to `<app-lobby/>` / `<app-winner/>`), so they're structurally out of scope. That leaves
  `START_ROLL` and `ROUND_ROLLING`, which the gallery never designs — **Linear and Clockwise fall
  back to Default's arc treatment for those two phases**, switching to their own composition only
  during `BIDDING`. Flagging it because it's a scope boundary the source material didn't cover.
- **Desktop.** `DesktopGameBoard` is *not* a second implementation — it wraps `MobileGameBoard` in a
  decorative phone frame ("the MVP deliberately presents the canonical mobile board"). So the
  switcher appears at every viewport by construction, and it stays that way: gating it to mobile
  would mean adding logic to hide a feature from a board that already *is* the mobile board.
- **Bid state survives a swap — structurally, not by hope.** `BidControls` sits in
  `.table-layout__rail`, outside the `@switch`, and takes zero `@Input()`s (`table.html:344` is
  `<app-bid-controls class="block" />` with no bindings). It is never inside a dashboard template, so
  Angular never destroys it on a layout change and a half-composed bid is untouched.
- **Eliminated players.** `ArcSeat` already handles `isEliminated` natively (dashed tile, struck
  name), so any dashboard built from it inherits that. The *local* player's spectator view is a
  separate tracked gap (`ISSUES.md`, `designs/perudo-spectator-claude-prompt.md`) — hold parity with
  today's behaviour across all three layouts, don't try to fix it here.
- **Fixture loader is orthogonal.** `fixture-loader.ts` only touches `GameStore`; the fixture JSON
  shape has no layout concept and needs none. For design review of a specific layout+fixture pair,
  the escape hatch needs no product code:
  `page.addInitScript(() => localStorage.setItem('perudo:boardLayout', 'clockwise'))` before
  navigating to `?fixture=…`.

## Verification

Every phase, from repo root:

```
npm run lint && npm run typecheck && npm test && npm run build
```

**Phase 1 must prove zero behaviour change.** Every CSS class name (`.mobile-wager-token`,
`.mobile-reveal`, `.mobile-hand-strip`, `.mobile-bid-sheet-wrap`, `.mobile-arc-wrap`,
`.table-layout__rail`, …) moves to a new template file but keeps its exact string — so the
selector-driven Playwright scripts should need **zero edits** and pass unmodified. That is stronger
evidence than any visual check:

```
npm run e2e                    # lobby-flow + bidding-flow + reconnect-timer-flow, unmodified
npm run e2e:render -w client
npm run design:compare -w client viewports bidding-mid out/phase1-default
```

Note `design:compare` composes side-by-side images for a human to eyeball — it has no pass/fail — so
treat the unmodified e2e pass as primary and the screenshots as secondary confirmation.

**Phases 2–3** need new tooling, because nothing today can reach a non-default layout (it's reachable
only by tapping the pill or via `localStorage`). Add `client/e2e/layout-render.mjs`, modelled on
`render-states.mjs`'s `openLive()` helper: seed the layout via `addInitScript`, load an existing
fixture, screenshot at 2 / 4 / 8 / 12 players — the counts that exercise the scaling formulas.
Register it as `e2e:layout-render` in `client/package.json` alongside `e2e:render` and
`e2e:fixtures`.

**Phase 4** adds `page.emulateMedia({ reducedMotion: 'reduce' })` coverage asserting the handoff
lands instantly with no intermediate animated frame.
