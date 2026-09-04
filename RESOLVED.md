# Resolved issues

Closed entries moved out of [ISSUES.md](ISSUES.md), which is the live backlog and should stay
short enough to read in one screen. Nothing here needs action — it is kept only so the root cause
of a past bug can be found without digging through git history.

The durable record of any fix is the code comment at the point of the fix plus the commit that
made it; this file is the narrative around those. Newest first.

---

### Two surfaces narrated one loss; the reveal now owns it (2026-09-04)

The mobile board showed both the reveal panel and `RoundLossModal` for the same event. Settled in
`designs/perudo-mobile-consolidated.dc.html` §3: on mobile the reveal card is the single loss
surface, and the modal's unique "Time ran out" branch became its own panel in the same shape. The
modal stays for desktop. The rework of how the reveal is composed is tracked as open work, not as
a question.

### Tokens were being read out of markup; they are now published (2026-09-04)

There is no `_ds` bundle beside the design files, so developers inferred values from inline styles —
which produced a near-invisible wood-brown brand badge, a room-code card wearing the end-card
treatment, and dice with 30% dead padding. All three were plausible readings of markup that never
said what a value was _for_. `00 Tokens` in the canonical file now names every value's role, marks
the one-offs, and explains the deliberately near-identical pairs.

### Dice rendered with a ring of dead space and a phantom second border

- **Found:** 2026-09-04, reported by the user during the design-parity pass ("each dice has some
  spacing and additional border with whitespace... its an old bug").
- **Two causes stacked.** `designs/assets/dice/die-face-N.png` is a 156×156 canvas whose die body
  occupies only the middle 110×110 — 23px of transparent padding per side, measured directly off
  the asset — so at `object-contain` the die rendered ~30% smaller than its own box. On top of
  that, `.die` painted `background: var(--color-ivory)` plus an inset shadow _underneath_ the art
  regardless of tier, and that ivory box showed through the art's transparent margin as a second,
  phantom die edge.
- **Resolved 2026-09-04:** `Die` now marks the wrapper `.die--art` when a per-face image is in
  play (no background, no inset shadow — the art is the whole die), and `.die__art` scales the
  image by 156/110 and re-centres it so the body is full-bleed. `max-width: none` is load-bearing:
  Tailwind's preflight `img { max-width: 100% }` silently clamped the rescale back to the box.
  Two `die.spec.ts` cases cover the art tier getting the class and the CSS-pip tier not.

### Dark vertical bands down both sides of the table screen

- **Found:** 2026-09-04, reported by the user in the same pass ("the table has blank darker space
  on left and right... the table image should took all the width").
- **Symptom:** `styles.scss`'s global `--app-gutter-x` applies a horizontal gutter to every
  `ion-content`, which inset `.table-surface` to `left: 24, width: 342` in a 390px viewport,
  leaving two darker strips of bare `ion-content` background. The bid tray is `position: fixed`
  and therefore _not_ inset, so it visibly overhung the mat on both sides — which is what made the
  bands obvious rather than merely present.
- **Resolved 2026-09-04:** the table screen zeroes `--padding-start`/`--padding-end` on its own
  `ion-content` (it is the one screen whose surface is meant to reach the physical edges in every
  design reference); `.table-surface`'s own `p-3` still keeps content off the edge.

### Mobile board never showed opponents' remaining dice counts

- **Found:** 2026-09-04, comparing the live board against `designs/mobile-lantern.dc.html`.
- Not only a visual gap: how many dice each opponent holds is information a player needs to reason
  about a bid at all, and the mobile arc seat showed nickname and turn state only. Both reference
  files draw a row of small dots under every name.
- **Resolved 2026-09-04:** `ArcSeat` renders one dot per remaining die (with the count exposed as
  text for assistive tech, since bare dots read as nothing), suppressed on an eliminated seat and
  during the opening roll — where the public die occupies that same slot and every seat still
  holds a full hand. The reference's "Bid placed" pill for the seat holding the standing wager was
  added in the same slot.

### Reveal summary read "You drops to 4 dice"

- **Found:** 2026-09-04, while rendering a synthetic fixture in which the local player loses.
- `nicknameFor` deliberately renders the local player as "You", which takes a plural verb — so the
  `nextRoundSummary` line added earlier that day produced "You drops to 4 dice" and "You is out".
- **Resolved 2026-09-04:** conjugated on whether the loser is the local player, with two
  `table.spec.ts` cases. Those tests read the computed directly rather than the rendered DOM:
  making the local player the loser is exactly what auto-opens `RoundLossModal`, and Ionic
  overlays cannot present in the unit-test DOM ("framework delegate is missing").

### Winner screen was a dead end

- **Found:** 2026-09-04, reviewing the end-of-match state against `perudo-mobile-flow.dc.html`.
- The screen offered no actions at all, and the stored reconnect token outlives the match, so
  reloading restored the same finished game rather than returning to the entry screen.
- **Resolved 2026-09-04:** added `SocketService.leaveMatch()` (drops the saved session, reconnects
  on a fresh socket, resets local state via the new `GameStore.resetMatch()`) behind a single
  "Back to the entry" action. Deliberately **no** "Play again": a rematch would need a server
  intent the engine does not define (CLAUDE.md 6.2), and inventing one was out of scope for a
  presentation pass. The screen also moved from a centred card on the app's light canvas to a
  bottom sheet over the dimmed table, which is how every reference draws the end cards.

### Server crashed on startup — `TimerConfigService` was never registered in `GameModule`

- **Found:** 2026-08-29, while running the full verification suite (lint/typecheck/test/build)
  after committing a large batch of previously-uncommitted work (Phases 4-6 plus an
  out-of-spec configurable-timer feature, see `TIMING_CONFIG.md`).
- **Symptom:** `npm run dev` / `nest start` threw `UnknownDependenciesException` immediately at
  boot — `TurnTimerService` injects `TimerConfigService`, but `game.module.ts`'s `providers`
  array never listed it. All tests still passed, because each spec file manually constructs
  `new TimerConfigService()` and passes it in by hand, masking the missing DI registration in
  the real app. Confirmed live: `npx ts-node src/main.ts` crashed before the fix and started
  cleanly after.
- **Resolved 2026-08-29:** added `TimerConfigService` to `GameModule`'s `providers`
  (`server/src/game/game.module.ts`).

### `setTimerMode` was a broken, global, cross-room timer kill-switch

- **Found:** 2026-08-29, same verification pass — auditing the newly-committed configurable-timer
  feature (`TIMING_CONFIG.md`, `TimerConfigService`, `perudo.config.json`) for correctness.
- **Symptom:** any connected socket, in any room, could call `setTimerMode` and it would disable
  turn timers for **every room on the server**, not just the caller's own — a global on-disk file
  write with no room scoping. Worse, the write had **no live effect**: `TimerConfigService` loads
  `perudo.config.json` once in its constructor and the handler never triggered a reload, so the
  change only took effect after a full server restart, while still emitting a false-positive
  `timerModeChanged` success acknowledgment. There was also no client UI for it — only reachable
  by hand-crafting a raw socket message. Separately, the config file itself lived at the repo
  root, but `TimerConfigService` resolves it via `process.cwd()`, which is always `server/` for
  every way this project actually starts the server (`npm run start:dev -w server`, `npm run
dev`) — so it was silently ignored either way.
- **Resolved 2026-08-29 (user's explicit choice: fix properly, scoped per-room, over
  removing it or leaving the cross-room behavior in place):** `RoomRuntime` gained a
  `timerEnabled: boolean | null` field (`server/src/game/rooms.service.ts`) — an in-memory,
  per-room override, `null` until a player in that room toggles it, falling back to
  `TimerConfigService`'s process-wide default otherwise. `TurnTimerService.startTimer` now checks
  `room.timerEnabled ?? this.timerConfig.enabled`. `handleSetTimerMode`
  (`server/src/game/game.gateway.ts`) no longer touches the filesystem at all — it mutates only
  the caller's own room, cancels/starts that room's timer immediately (no restart needed), and
  broadcasts `timerModeChanged` + a fresh `state` snapshot to that room only. `perudo.config.json`
  moved to `server/perudo.config.json` (where the server actually looks for it) and now stays a
  static, server-operator-set startup default only — never client-writable. 5 new gateway
  integration tests cover cancel-on-disable, restart-on-enable, room-scoped broadcast, invalid
  payload rejection, and cross-room isolation (`game.gateway.spec.ts`).

### Lobby "open seat" placeholders — computed but never rendered in a loop

- **Found:** 2026-08-29, from 2 pre-existing failing tests surfaced by the same verification pass
  (`lobby.spec.ts`'s "open-seat placeholders" suite).
- **Symptom:** `Lobby.openSeatNumbers` (`client/src/app/features/lobby/lobby.ts`) correctly
  computed one entry per remaining table seat, but `lobby.html` never iterated over it — it
  rendered exactly one hardcoded "Open Seat" `<li>` regardless of how many seats were actually
  open, or none at all at full capacity.
- **Resolved 2026-08-29:** wired an `@for` loop over `openSeatNumbers()` into the roster list,
  each row reading "Seat N — open". Also removed an unused `LucideCheck` import from the same
  component flagged by the Angular compiler (`NG8113`) during this pass.

### `bid-controls__suggestions` causes ~40px of horizontal page overflow at 320px viewport width

- **Found:** 2026-08-11, while verifying the mobile hand-strip dice size change didn't introduce
  horizontal scroll.
- **Symptom:** at a 320px-wide viewport, `document.body.scrollWidth` (362px) exceeds
  `document.documentElement.clientWidth` (320px). The offending elements are all inside
  `.bid-controls__suggestions` (`client/src/app/features/bid-controls/`) — the horizontally
  scrollable row of bid-suggestion pills (Minimum / Switch to aces / Switch to a face).
- **Resolved as of 2026-08-15 (Phase 4 UI/UX pass):** re-tested live at a real 320px viewport
  through a full two-player match reaching BIDDING — `document.documentElement.scrollWidth` now
  equals `clientWidth` (320px, no page-level overflow at all), and
  `.bid-controls__suggestions` itself has `scrollWidth` (250px) only marginally over its own
  `clientWidth` (248px) — its own intentional internal horizontal scroll, not a page-level leak,
  and its right edge (284px) sits well inside the 320px viewport. Whatever caused the original
  40px page-level overflow was fixed by one of the intervening `fix(mobile): ...` commits between
  2026-08-11 and this verification; no code change was needed in this pass, only re-confirmation.

### `table.scss`, `lobby.scss`, and `entry.scss` exceed the Angular component style budget

- **Found:** 2026-08-11 (`table.scss` only; `lobby.scss`/`entry.scss` grew past the same 4kB
  threshold at some point before 2026-08-15 without being logged here).
- **Pre-existing, not bloat** — all three are legitimately large, multi-state component
  stylesheets (table: seats/dice/bid-tray/reveal/timer across mobile+desktop-phone-frame; lobby
  and entry: full pirate-theme surfaces with several sub-states), not accidental duplication.
- **Resolved 2026-08-15 (Phase 4 UI/UX pass):** raised `anyComponentStyle` in
  `client/angular.json` from 4kB warning / 8kB error to 8kB warning / 16kB error — comfortably
  above the current worst case (table.scss, 7.07kB) with headroom, while still catching genuine
  future runaway growth. `npm run build -w client` is clean of budget warnings as of this change.

### Real Scenario 2D dice art was generated but never wired into the live per-face renderer

- **Found:** 2026-08-15, Phase 4 UI/UX pass — auditing `designs/assets/` against what
  `VISUAL_ASSETS_CONFIG`/`DICE_FACES_CONFIG` actually reference.
- **Symptom:** `designs/assets/dice/die-face-1.png` through `-6.png` (already copied to
  `client/public/assets/dice/`, confirmed present in the build output) are higher-quality,
  more textured individual die renders than `dice-sprite.png` (the strip actually wired in via
  `VISUAL_ASSETS_CONFIG.diceSprite`), but `DICE_FACES_CONFIG.imageUrl` — the `Die` component's
  own highest-priority swap-in point, by design (`ui/die/die.ts`'s doc comment) — was left unset,
  so the app rendered the flatter sprite instead of the nicer per-face art that was sitting right
  there unused.
- **Resolved 2026-08-15:** populated `DICE_FACES_CONFIG[].imageUrl` with the per-face PNG paths.
  Confirmed via a live two-player Playwright run that the richer, shadowed ivory dice now render
  with zero component changes (exactly the "swap needs no component changes" contract the config
  was designed for) — see `dice-check-real-art.png`. All six faces re-verified as standard pips,
  no skull (8.2). `shared/src/dice-faces.config.spec.ts` and `client/.../ui/die/die.spec.ts`
  updated for the new default (per-face image) and both fallback tiers (sprite, then CSS pips).

### No client-side feedback when a player loses a die to the turn timer (only call-liar losses were surfaced)

- **Found:** 2026-08-15, Phase 4 UI/UX pass — a real ~56-second timeout capture showed the round
  silently advance with one fewer die and no explanation, unlike a call-liar loss (which
  `RoundLossModal` already surfaces prominently).
- **Root cause:** `RoundLossModal` only ever reacted to `GameStore.lastReveal` (set from
  `ROUND_REVEALED`); a pure timeout stall (5.7) produces no reveal at all, only `TURN_TIMED_OUT`,
  which nothing in `/client` was listening for.
- **Resolved 2026-08-15:** added `GameStore.lastTimeout` (set only when `dieLost: true` — a
  _protected_ double-loss-protection stall correctly still produces no notification, since no die
  was actually lost) and a second trigger effect in `RoundLossModal`, branching its template to a
  "Time ran out" / "TURN TIMED OUT" variant instead of the claimed-bid/actual-count reveal
  content. Verified with a real ~56s server-authoritative wait in a live two-player match — the
  modal opens with the correct copy and die-remaining count at the actual moment the server times
  the turn out, and auto-closes the same way a reveal loss does. 6 new component tests + 1
  `GameStore` test cover both the open/branch logic and the dieLost:false no-op case.

### Reveal recap panel (mobile board) stayed visible through the entire following round

- **Found:** 2026-08-15, Phase 4 UI/UX pass — a screenshot mid-way through round 2's hand-rolling
  showed round 1's "Truth revealed" recap still fully rendered above the "Roll your hand" button.
- **Root cause:** `GameStore.lastReveal` is deliberately never cleared on `ROUND_STARTED` (engine
  emits both in the same batch — clearing there would erase it before any consumer ever saw it,
  per the field's own doc comment), but nothing else ever cleared it either, so it lingered
  through the _entire_ next round, including into that round's own BIDDING phase.
- **Resolved 2026-08-15:** `GameStore.applyEvents` now clears `lastReveal` the moment I roll my
  own hand for the new round (`PLAYER_ROLLED_HAND` for my own player id) — a natural "I've moved
  on" signal that can't co-occur with the reveal in the same batch, so it doesn't fight the
  existing ordering constraint. An opponent rolling their hand does not clear it (confirmed by
  test), only my own action does.

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
  `flex: 1; height: 100%; contain: size style;` — it depends on a parent with a _definite_ height
  to resolve `height: 100%` against, which is normally supplied by Ionic's standard
  `ion-app > ion-page` scaffolding. This app has neither. Every ancestor instead used
  `min-height: 100dvh` (`MobileGameBoard`, `DesktopGameBoard`'s phone frame) — `min-height` never
  counts as "definite" for a descendant's percentage-height calculation, so `height: 100%` collapsed
  to `0`, and `contain: size` blocked the usual content-based auto-sizing fallback that would
  otherwise rescue a plain block element from that. `ion-content`'s shadow-DOM scroll wrapper
  (`.inner-scroll`, itself `position: absolute` + `overflow: hidden`) collapsed to zero height too
  and clipped everything inside it — even though `.table-surface`'s _own_ CSS (`min-height: 100dvh`)
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

### Two approved design files disagreed on the player-identity colour

- **Found:** 2026-09-04, during the design-parity pass. `perudo-lobby-lantern.dc.html` gave each
  roster seat its own avatar gradient (brass for "you", sage for the next player) while
  `mobile-lantern.dc.html` made every arc seat a uniform wood-brown, and the app followed the
  second. Phase 4's token audit had recorded that "the old brass-toned identity gradient matched no
  colour in the approved design" — a claim made having checked only one of the two files.
- **Resolved 2026-09-04** by the user naming `perudo-mobile-consolidated.dc.html` as the basis for
  the design. It settles the question outright: the lobby roster avatar is a **38px circle**
  coloured by _role_, not identity — solid terracotta for the local player, translucent cream for
  everyone else. The wood `--color-identity-*` pair belongs to the table's cup silhouettes; the two
  are different objects, which the earlier cross-file comparison had conflated. The entry-screen
  brand badge (same gradient, but a logo mark rather than an identity tile) became the canonical
  file's lit terracotta circle in the same pass.

### Reveal verdict block, bid wording, round chip and roster subline — all four settled by the canonical file

- **Found:** 2026-09-04, logged as four separate "the reference and internal consistency point
  different ways" judgment calls.
- **Resolved 2026-09-04**, again by `perudo-mobile-consolidated.dc.html` being named the basis.
  Its panel "08 Reveal" answers all four directly:
  - **Verdict block** — a large display-face word with the reasoning inline beside it, not a small
    caps label stacked in a pill. The "false" variant is a warm rust (`#8c491a`, exactly
    `--color-brass-deep`), not an alarm red: losing a die is the game working, not an error. The
    loser sentence folds into that inline text, replacing a separate bold line that had been saying
    the same thing twice.
  - **Bid wording** — "4 × fives", plural face names, not "4 × face 5".
  - **Round chip** — "Round 3 · revealed" during a reveal, not the dice count (which has already
    changed to reflect the loss the player is still reading about).
  - **Roster subline** — the canonical lobby row has none, so the "Host · set the rules" /
    "Joined a moment ago" second line is simply not part of the design. This also retires the
    concern that the `Player` model has no timestamp to render it truthfully.
