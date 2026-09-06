# Board dashboard switching — status report

Tracks progress against `plans/board-dashboard-switching.md`. Read that file first for the full
plan (decisions, phases, ring math, edge cases); this file is just "where things stand."

## Done — all 5 phases

**Phase 1 — pure refactor (commit `59e884a`).** Extracted `features/table/table.ts` into:
- `core/game-view.ts` (`GameView`, injectable) — shared state→text derivations.
- `core/layout.store.ts` (`LayoutStore`, `@ngrx/signals`) + `features/board/dashboards/dashboard-registry.ts` — the fixed layout cycle.
- `features/board/seat-geometry.ts` — pure geometry functions.
- `ui/wager-token/`, `ui/mobile-reveal-panel/` — shell-owned, input()-driven presentational components.
- `features/local-hand-zone/` — self-contained (injects its own `GameStore`/`SocketService`).
- `features/board/board-shell/` (renamed `Table`) — header/switcher/bid-rail/`RoundLossModal`, the `@switch` over dashboards.
- `features/board/dashboards/default-dashboard/` — today's arc, reproduced verbatim.
- Placeholder `linear-dashboard/` and `clockwise-dashboard/` (built for real in later phases).
- Verified zero behavior change: `lobby-flow`/`bidding-flow`/`reconnect-timer-flow` e2e passed **unmodified**.

**Phase 2 — Linear dashboard for real (commit `a38e54c`).** Variant A "Below deck": a spotlight
card for whoever's bidding + a horizontal scrollable rail of everyone else in turn order, built
from `ArcSeat` (not new markup), with a "+N more" overflow pill and right-edge fade. `ArcSeat`
gained an additive `isLocalPlayer` input (terracotta identity fill, Decision 6) — verified it
survives simultaneously with the active/current-bidder brass halo. Falls back to
`DefaultDashboard`'s arc outside BIDDING.

**Phase 3 — Clockwise dashboard for real (commit `16161e5`).** Variant B "Round the table":
waiting players on an ellipse ring around the spotlight. `seat-geometry.ts` gained the real
ring math — `computeRingPosition()` (60° bottom gap, clockwise-from-top), `ringRadiusPercent()`,
`ringSeatSizePx()`, `ringSeatOpacity()` — all continuous functions of opponent count per Decision
7, not breakpointed. Local player's seat is always exempt from the tail-dimming. Falls back to
`DefaultDashboard`'s arc outside BIDDING.

**Phase 4 — motion (commit `b605d18`).** Chose "seats move between slots" over "the ring
rotates" (track-by-id already keeps a remaining ring seat's DOM node stable across a turn-order
re-sort, so a plain CSS transition on left/top carries it to its new slot — no rotation math
needed). Ring seats now slide over 380ms with a 40ms-per-index stagger
(`--seat-stagger-index`). Both dashboards' spotlight/hero card plays a brief scale+fade entrance
exactly when the spotlight changes hands (an `effect()` compares previous vs current bidder id —
a dice-count update with the same bidder does not replay it). `@media
(prefers-reduced-motion: reduce)` disables both, same precedent as `loader.scss`/
`turn-timer.scss`. Also switched Linear's `BidMarker` to `size="default"` (was `"prominent"`),
matching Clockwise — this incidentally closed status-report item #2 from the earlier draft of
this file. New `client/e2e/reduced-motion-check.mjs` (+ `npm run e2e:reduced-motion`) asserts the
*computed* `animation`/`transition` values actually neutralize under reduced motion, not just
that a class toggles (the class itself toggles regardless of motion preference by design — it's
the stylesheet that must react).

**Not literally built:** the reference's card-flies-from-hero-to-queue-edge choreography. Hero and
ring/rail are structurally different DOM subtrees in this codebase (no single element to animate a
path between) — doing that literally would need a shared `SpotlightCard`/`ArcSeat`-unifying
component, judged not worth building for this pass. Logged in `ISSUES.md`.

**Phase 5 — docs.** Added the "swappable board dashboards" addendum to `CLAUDE.md`'s Phase Status
section (matching that file's existing addendum convention) and an "Experimental board dashboards
not yet reconciled with the canonical design" entry to `ISSUES.md` → Open, covering: the
gallery's own "concept, not canonical" status, the Clockwise hero-card overlap (below), and the
motion scope-cut above.

Both new dashboards ship `client/e2e/layout-render.mjs` (+ `npm run e2e:layout-render`) as the
tooling to screenshot a layout at 2/4/8/12 players via the fixture loader — nothing else can
reach a non-default layout without tapping the switcher pill or hand-setting `localStorage`.

**Repo-wide state:** lint/typecheck/build clean; 65 shared + 37 server + 317 client tests green;
full e2e suite (`lobby-flow`, `bidding-flow`, `reconnect-timer-flow`) passes with zero console
errors and **no edits** — Default's behavior is untouched by any of this.

## Not done (out of scope for what was asked, or a genuine open call)

- **Phase 0** (parallel design pass on the gallery — shrink the hero card, decide the "your seat
  in N" chip) — never started, out of sequence relative to Phases 1-5 which were built first. Doing
  this now would likely resolve the Clockwise hero-card overlap "for right," rather than the
  current generously-sized-ring workaround.
- Whether either experimental layout ships as a real product option, stays a design-review toggle,
  or gets removed — a product decision, not something this work decides.

## Worth noting / open issues

1. **Clockwise hero-card overlap, not fully resolved.** The reference's compact 148px/136px hero
   card assumes bespoke "CALLS" markup this build doesn't have. Reusing `BidMarker` (Decision 10:
   reuse over redrawing) needs more vertical room (~176px even after trimming padding/using
   `size="default"`), so the hero card's height is left to size to its content rather than
   matching the reference's exact figure, and the ring was sized generously (480px tall) to
   compensate. At the smallest tables (3 opponents, the "light table" endpoint where
   `ringRadiusPercent` gives the smallest radius) the two seats flanking the reserved bottom gap
   still graze the hero card's rounded corner by a few pixels. Visible in
   `client/e2e/.screenshots/layout-render/clockwise-4p.png` (and `-2p.png`/`-8p.png` to a lesser
   degree). Two honest ways to close this, either is fine:
   - Do Phase 0 first and build a real compact hero card component shared by both dashboards
     (decision 10's `SpotlightCard` fallback) instead of reusing `BidMarker` wholesale.
   - Or just push `ringRadiusPercent`'s light-table `ry` endpoint out further (currently 30%) —
     cheaper, doesn't touch the hero card at all, but is patching the symptom.
2. ~~Linear's spotlight card also uses `BidMarker size="prominent"`~~ — **closed in Phase 4**: both
   dashboards now use `size="default"`.
3. **Dead ring/geometry surface**: `seat-geometry.ts`'s `ArcPosition` interface is now exported
   (was previously module-private) purely so `ClockwiseDashboard.ringPosition()` could have an
   explicit return type per CLAUDE.md §4.1 — check nothing else should be consolidated now that
   it's public.
4. **No visual regression coverage for Clockwise/Linear beyond `layout-render.mjs`'s manual
   screenshots** — unlike Default, which the full e2e suite exercises directly. If either
   dashboard's markup breaks, only a human (or a future automated pass) looking at those
   screenshots would catch it; there's no automated pixel/console-error gate for them the way
   `npm run e2e` is for Default. `layout-render.mjs`'s own exit code does at least catch console
   errors and can be wired into CI if desired. The new `reduced-motion-check.mjs` covers only the
   motion-neutralization behavior, not general visual regressions.
5. **Phase 3's ring seat count assumptions**: `ringRadiusPercent`/`ringSeatSizePx`'s endpoints (3
   and 11 opponents) were read off the reference's own B-4P/B-12P panels (4 and 12 total players).
   A 2-opponent table (3 total players) clamps to the same values as 3 — never verified whether
   that clamping reads oddly at the very smallest table size (2 players total, 1 opponent) since
   `computeRingPosition`'s own `count <= 1` special case (single point at `{50%, 18%}`) takes over
   there anyway, but worth a quick look.
6. **No Angular-animations-package or WAAPI-driven choreography** — everything in Phase 4 is plain
   CSS `transition`/`animation` triggered by class/style bindings. Simpler and fully testable via
   computed styles, but it's why the literal fly-in choreography (item in "Not literally built"
   above) wasn't attempted — a real cross-element path animation would need it.

## Commits

`59e884a` (Phase 1) → `a38e54c` (Phase 2) → `16161e5` (Phase 3) → `b605d18` (Phase 4) → this doc's
own commit (Phase 5), all on `develop`.
