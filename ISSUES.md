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
- **Suggested next step:** either raise the `anyComponentStyle` budget for this one file in
  `client/angular.json` (it's inherently a large, multi-state component) or split `table.scss`'s
  mobile-only rules into a separate file once `MobileGameBoard` becomes its own real component
  with its own stylesheet, rather than living inside `Table`'s.

---

## Resolved

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
