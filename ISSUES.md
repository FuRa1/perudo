# Known issues / backlog

A running log of things found while working that were **not** fixed in the moment — either
out-of-scope for the task at hand, need more investigation than a quick pass allows, or are a
deliberate judgment call worth someone else's sign-off before spending time on. Not a full bug
tracker, just enough context for whoever picks one of these up (including a future agent session
with no memory of how it was found) to not have to rediscover it from scratch.

Format: one entry per issue, newest first within its section. Move an entry from **Open** to
**Resolved** (with the commit/PR that fixed it) rather than deleting it.

---

## Open

### `bid-controls__suggestions` causes ~40px of horizontal page overflow at 320px viewport width

- **Found:** 2026-08-11, while verifying the mobile hand-strip dice size change didn't introduce
  horizontal scroll.
- **Symptom:** at a 320px-wide viewport, `document.body.scrollWidth` (362px) exceeds
  `document.documentElement.clientWidth` (320px). The offending elements are all inside
  `.bid-controls__suggestions` (`client/src/app/features/bid-controls/`) — the horizontally
  scrollable row of bid-suggestion pills (Minimum / Switch to aces / Switch to a face). That row is
  *intentionally* `overflow-x: auto` (AGENTS.md 5.8: "compact and horizontally scrollable where
  needed"), so this may be a false-positive from measuring `body.scrollWidth` rather than the
  scroll container's own bounds — or the scroll container may genuinely be leaking overflow to the
  page.
- **Confirmed NOT the same root cause as the `ion-content` sizing bug below:** re-tested after that
  fix landed (which also added `:host { display: block; }` to `BidSuggestion` and every other
  component missing it) — the same ~40px overflow still reproduces identically at 320px. Whatever
  this is, it's unrelated and still needs its own investigation.
- **Suggested next step:** confirm whether real page-level horizontal scroll actually occurs at
  320px (vs. just an inflated `scrollWidth` reading), and if so, contain it (e.g. `overflow: hidden`
  or `contain: layout` on a wrapping ancestor).

### `table.scss` exceeds its Angular component style budget

- **Found:** 2026-08-11, `npm run build -w client` output: `src/app/features/table/table.scss
  exceeded maximum budget. Budget 4.00 kB was not met by 3.21 kB with a total of 7.21 kB.`
- **Pre-existing** — confirmed the same order-of-magnitude overage exists at the last commit
  (`git show HEAD:client/src/app/features/table/table.scss` is already ~13 kB source), not
  something introduced by the mobile-board rework's small additions to the same file. A warning,
  not a build failure.
- **Update 2026-08-12:** overage grew slightly to 3.40 kB (total 7.41 kB) after the desktop-board
  visual-bug fixes below added a bit more CSS to this same file — still the same pre-existing
  condition, not a new one.
- **Suggested next step:** either raise the `anyComponentStyle` budget for this one file in
  `client/angular.json` (it's inherently a large, multi-state component) or split `table.scss`'s
  mobile-only rules into a separate file once `MobileGameBoard` becomes its own real component
  with its own stylesheet, rather than living inside `Table`'s.

---

## Resolved

### Four visual bugs in the mobile board when displayed inside `DesktopGameBoard`

- **Found:** 2026-08-12, from a user-reported desktop screenshot at 1440×900 (opening-cast state).
- **1. Dark "funnel" side shadow + possible pale top strip.** Root cause:
  `.desktop-board-stage__phone`'s `box-shadow: 0 0 48px rgba(0, 0, 0, 0.52)` (48px blur, 52%
  opacity, no offset) was wide and dark enough against the equally-dark stage background to read
  as a diffuse funnel rather than a clean edge; `.desktop-board-stage`'s own background carried an
  off-center radial gradient hot-spot (`50% 18%` — near the top) as an additional contributor.
  Fixed: replaced the wide glow with a 1px `--color-border-onboard` hairline plus a much narrower
  `0 0 20px rgba(0, 0, 0, 0.3)` shadow, and flattened the stage background to a single flat fill.
  The `transform: translateZ(0)` fixed-position containing block (bid sheet/modals) was
  deliberately left untouched. Could not independently reproduce a distinct pale top strip in this
  environment, but the radial gradient's top-biased hot-spot was the most likely cause and is gone
  either way.
- **2. Native scrollbar across the opponent arc even with one opponent.** Root cause: the
  decorative mat-glow `::before` pseudo-element lived on `.mobile-arc-wrap` itself (the
  `overflow-x: auto` scroll container) with a negative `inset` bleeding 30px past its own right
  edge for a soft vignette look. That bleed counted as real content toward the scroll container's
  own `scrollWidth`, independent of how many opponents were actually seated — confirmed via
  `scrollWidth` (356px) exceeding `clientWidth` (326px) at 1440px with a single opponent, whose
  seat never approached the container's actual width. Fixed by moving the glow to a new
  non-scrolling `.mobile-arc-outer` wrapper around `.mobile-arc-wrap` — a pseudo-element on a
  plain ancestor can bleed past its own edges freely; only an `overflow: auto` element's own
  scrollable box cares about content extending past it. Also added cross-browser scrollbar-hiding
  (`scrollbar-width: none` / `::-webkit-scrollbar { display: none }`) to `.mobile-arc-wrap` for the
  genuine 6-7 opponent case that can still exceed available width before the two-arc stress layout
  takes over at 8 — touch/trackpad/keyboard scroll stays intact, only the visible track is hidden.
- **3. Plain, flat opponent identity tile.** No texture, no per-player variation beyond the
  initial letter — every opponent's tile was the exact same gradient block. Added a second
  background layer reusing the same plank-grain `repeating-linear-gradient` the table surface
  itself already uses (`table.scss`'s `$table-fallback-layers`), an inset top-edge highlight for a
  "carved/brass-fitting" light catch, and a restrained 5-variant gradient-angle set
  (`ArcSeat.tileVariantClass`, a stable hash of `player.id`) so tiles read as a deliberate carved
  set rather than identical stamps — identity itself is still always the initial letter + nickname,
  never the tile or its variant alone. No new assets, no real avatars.
- **4. Cast/roll button icon reads as a boxed glyph.** Root cause: `lucideDice5` (a single die
  face needing 5 distinct pips) at the app's global icon config (20px, 2.5 stroke-width) doesn't
  have room to render legible individual pips — they merge into a blob that reads as a plain box.
  Confirmed via DOM inspection that the SVG itself was rendering correctly (real Lucide SVG,
  correct size) — this was a legibility/icon-choice problem, not a missing/broken icon. Switched
  all 4 usages (opening cast, hand roll, and their "again" variants) to `lucideDices` (Lucide's
  two-dice icon), which reads clearly as "dice" at the same size without needing individual pips
  to be distinguishable. Audited every other icon in the app (Ledger has no icon, by design;
  `LucideHand`/`LucideCheck`/`LucideCircleUserRound` all render correctly at the global config) —
  no other icon needed a change.
- **Verified:** genuine Playwright mouse clicks succeeded on the opening-roll button at 390×844,
  1440×900 (desktop phone frame), with real state changes following each click. Zero page-level or
  arc-wrap-level horizontal overflow confirmed at 320px, 390px, 430px, and 1440px (phone frame).
  Bid sheet and Ledger reconfirmed correctly contained within the phone frame after the
  shadow/border change. The 9-12 player two-arc stress case (10 players) still renders with no
  overflow and the new tile texture on every seat. `npm run lint`, `typecheck`, `test -w client`
  (150 tests), and `build -w client` all clean.

### Mobile board content intermittently failed to paint / receive clicks — `ion-content` was collapsing to zero height

- **Found:** 2026-08-11, while verifying the mobile-board responsive rework (`GameBoard` /
  `MobileGameBoard` / `DesktopGameBoard` split).
- **Symptom:** at a real point inside `.table-surface` (e.g. mid-screen, well within the header
  chip's own reserved area), `document.elementFromPoint(x, y)` resolved to an ancestor several
  levels up (`app-mobile-game-board`, or `body` when `<app-table>` was rendered directly) instead
  of any of the actual content in between. Screenshots taken at the same moment showed the affected
  region as flat beige (`--color-page`, the light "off-table" background) instead of the dark table
  surface. Real-mouse Playwright clicks on the roll/cast buttons and the bid-suggestion pills
  failed with "element is outside of the viewport" / "intercepts pointer events", while a raw DOM
  `.click()` (bypassing hit-testing) worked fine — so the Angular event bindings and game logic
  were never at fault, only the rendering/hit-testing geometry.
- **Confirmed NOT caused by the mobile-board rework itself:** reproduced identically on a fresh
  `npm run dev` process, and reproduced identically with `<app-table />` rendered directly as
  `app-root`'s child (the exact structure already committed before the `GameBoard` split) — so it
  predated that work.
- **Root cause:** `ion-content`'s own `:host` CSS (`@ionic/core/.../content/content.css`) is
  `flex: 1; height: 100%; contain: size style;` — it depends on a parent with a *definite* height
  to resolve `height: 100%` against, which is normally supplied by Ionic's standard
  `ion-app > ion-page` scaffolding. This app has neither. Every ancestor instead used
  `min-height: 100dvh` (`MobileGameBoard`, `DesktopGameBoard`'s phone frame) — `min-height` never
  counts as "definite" for a descendant's percentage-height calculation, so `height: 100%` collapsed
  to `0`, and `contain: size` blocked the usual content-based auto-sizing fallback that would
  otherwise rescue a plain block element from that. `ion-content`'s shadow-DOM scroll wrapper
  (`.inner-scroll`, itself `position: absolute` + `overflow: hidden`) collapsed to zero height too
  and clipped everything inside it — even though `.table-surface`'s *own* CSS (`min-height: 100dvh`)
  still reported a correct `getBoundingClientRect()` in isolation, which is what made this so
  confusing to diagnose (every individual element "looked right" on inspection).
- **Fix, first pass (scoped, incomplete):** `features/table/table.scss` initially set
  `ion-content { position: fixed; inset: 0; ... }` for the table screen only, sizing it directly
  off the viewport instead of through the broken percentage chain.
- **Turned out to be a global gap, not Table-specific:** verifying the remaining screens (Entry,
  Lobby, Winner) surfaced the exact same bug on all three — `Entry` in particular rendered as a
  completely blank page (no title, no form, nothing but a faint background glow), since none of
  them set their own `ion-content` sizing either, only inheriting the shared default in
  `styles.scss` (background/padding, no position/height). **Fix moved to `styles.scss`'s global
  `ion-content { ... }` rule** — every screen gets `position: fixed; inset: 0` from one place now;
  `table.scss`'s own rule was simplified back down to just its dark-theme color override.
  `DesktopGameBoard`'s existing `transform` on `.desktop-board-stage__phone` (added for the same
  reason `.mobile-bid-sheet` needed it) still gives `position: fixed` a containing block on desktop,
  so the table screen still confines correctly to the phone frame there instead of the full window.
- **Related fix, same audit:** 14 of 18 client components had no `:host` display rule at all
  (defaulting to `display: inline`), which was a contributing factor to the same class of
  paint/hit-test unreliability elsewhere (e.g. bid-suggestion pills). All of them now have an
  explicit `:host { display: block; }`.
- **Verified end-to-end, every phase:**
  - A full two-player match (opening roll → hand roll → bid via a real click on a suggestion pill
    → call liar → reveal → round 2 → repeat to a decisive `GAME_OVER`) completes using genuine
    Playwright mouse clicks throughout, no `.click()`-bypassing workarounds needed anywhere.
  - Entry, Lobby (including a real "I'm ready" click), and Winner all confirmed via
    `document.elementFromPoint` resolving into the real DOM tree, correct `ion-content` height
    (844px, not 0), and screenshots showing full correct rendering (previously: blank beige).
  - The 9-12 player two-arc stress layout (10 players joined to one room) renders correctly with
    both a plain 390px mobile viewport and inside the 430px desktop phone frame.
- **Note:** never confirmed on a real device/headed browser — only in headless Chromium via
  Playwright in this environment. Given the root cause is a genuine CSS sizing bug (not a
  Chromium-specific quirk) that made the Entry screen render as entirely blank, it's reasonable to
  expect it affected real users too, but that's inference, not direct observation.
