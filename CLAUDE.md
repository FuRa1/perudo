# CLAUDE.md — Perudo "Pirates of the Caribbean"

Persistent project context for the agent. **Read this in full before starting any work.** This is the single source of truth for rules, architecture, quality standards, and workflow. You do not have access to the discussions this was assembled from — everything essential is stated here explicitly. If something needed for a correct implementation is missing — **stop and ask**, do not silently invent it.

---

## 0. HOW TO WORK WITH THIS FILE

- Work proceeds **strictly in phases, in order** (section 9). Do not jump ahead or mix phases.
- Before a phase — re-read its block and the related spec sections.
- Every phase ends in a **working, committed, lint-clean, type-clean state** (see 4.4).
- On finishing a phase, update "Phase Status": mark `[x]`, briefly note what was done and where you stopped.
- Open questions (section 12) **must not be closed by you** — ask the user.
- Decisions marked **[DEFAULT — confirm]** should be implemented as described, but remind the user at a convenient moment that it is an assumption.

---

## 1. PHASE STATUS

- [x] Phase 1 — Monorepo skeleton and quality infrastructure. `/client` (Angular 21.2 standalone + zone.js, Ionic 8.8.16 — 9.x isn't published yet, confirmed with the user to use 8.8.x now and bump later, Tailwind 4), `/server` (NestJS 11), `/shared` (TS, Jest) scaffolded as npm workspaces. One root `eslint.config.mjs` (flat config, scoped per package) and one root `.prettierrc.json` — no per-package configs. TS strict everywhere. `rules.config.ts` holds the 3.4 constants; `/shared` builds and is imported by both `/client` and `/server` (proven via a trivial `RULES_CONFIG`-backed status endpoint/label, not game logic). `npm install`, `npm run dev` (server :3000 + client :4200), `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` all verified clean from a fresh install. No game logic yet, per phase scope.
- [x] Phase 2 — Domain logic (`GameEngine`) + tests. All types/logic live in `/shared` under `types/`, `logic/`, and `game-engine.ts` (no transport imports; RNG only via the injected `DiceRoller` interface, `SequenceDiceRoller` for tests). Implemented: the full 6.1 state machine (LOBBY → START_ROLL → ROUND_ROLLING → BIDDING → REVEAL/ROUND_END, computed atomically since there's no player intent that targets them, → next BIDDING | GAME_OVER) with an explicit phase×intent legality table; the aces conversion scale (5.4) including the conditional sixes-collision bump, tracking only the last bid and the last normal bid (not full history) per the spec's documented minimum; wild-aware counting and the exact-match-caller-loses rule (5.3); special round (5.5 — no wild aces, face fixed, quantity-only raises); turn timeout with double-loss protection modeled as an alternating lose/protect streak (5.7); starting-roll ties re-rolling only among the tied (5.2); loser-goes-first-or-next-in-seating-order (5.3); match win (5.9). `reconnect` intent is deliberately not modeled yet (Phase 5, session tokens). 49 tests in `/shared`, including all 4 worked examples from 5.4 verbatim; `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` all verified clean repo-wide.
- [x] Phase 3 — Transport (Socket.io gateway) + client, basic playability. `/server`: `GameGateway` (`@WebSocketGateway`) is a thin translator from socket messages to `GameEngine` intents — `RoomsService` holds in-memory rooms (roomId → `MatchState` + `CryptoDiceRoller` + a promise-chain queue serializing each room's mutations, 3.3); `CryptoDiceRoller` (crypto.randomInt) is the real 6.4 production RNG, injected. `/shared` gained `selectPlayerView` (4.5/6.6 filtered snapshot — blanks every other player's `dice`, keeps `diceCount` visible) so the gateway broadcasts events to the whole room but sends each connected player their own personalized `state` snapshot. `/client`: `SocketService` is the only file touching `socket.io-client` (3.2); `GameStore` holds Signals fed by it; screens — entry (room+nickname), lobby (ready toggle), table (seats, private dice, roll button as the Phase-3 "basic shake gesture", bid history, reveal banner), bid-controls (quantity/face + 5.8 hints — minimum bid, switch to/from aces — using `isLegalBid`/`cheapestLegalBid`/etc. straight from `@shared`, disabled instead of silently rejecting on `!isMyTurn` client-side, with the server as the real authority), winner. Verified twice: a scripted Socket.io client through a full round, and a real two-browser-context Playwright run (join → ready → start-roll → hand-roll → bid → call liar → correct outcome → round 2 with the correct next bidder), no console errors. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all clean repo-wide. Not done here (later phases): real timers/timeout wiring (5.7's engine logic already exists from Phase 2, just not triggered by a clock yet), reconnect, and visual polish.
- [x] Phase 4 — UI/UX polish and graphics integration. **Complete (2026-08-15).** Figma was never used for this project — there is no Figma file, and 8.1's "tokens → Tailwind config" line always meant Figma in the abstract, not a file this project ever had access to. The approved visual source is `designs/mobile-lantern.dc.html` (the canonical "lantern cabin" table scene), cross-checked against `designs/perudo-design-kit.dc.html`/`perudo-graphics-spec.dc.html` for the wider palette — all three are literal, self-contained HTML with inline hex/rgba values, read directly off the markup rather than guessed or invented. `client/src/theme/_tokens.scss`'s header now documents this provenance explicitly and cross-references every requested semantic name (parchment, parchment-muted, wood, wood-dark, gold, gold-highlight, sea, sea-dark, ink, ink-muted, border, focus, success, warning, danger, overlay, shadow, surface, surface-raised) to either an existing token that already matched or a newly added one — see that file's own header comment for the full mapping, not restated here. Two real, previously-unnamed token gaps were found and fixed as actual **token mismatches**, not just additions: (1) the per-player identity tile (`--color-identity-start/end`) was a brighter, more saturated brass tone that matched no color in the approved design at all — corrected to the design's actual opponent-seat/cup wood gradient (`#6b4f31`/`#33261a`, now also exposed as `--color-wood`/`--color-wood-dark`); (2) the current-bid badge's border-radius was `--radius-tile` (16px) against the design's literal 20px (`--radius-panel`) — corrected. New tokens derived directly from mobile-lantern.dc.html's own literal values: `--color-gold-highlight` (#f0c98d, the turn-order kicker), `--color-success` (#aebf92, the "rolled" status text — distinct from the more saturated `--color-sage` used elsewhere), `--color-warning` (a named alias for `--color-brass`, so the timer's warning phase references something semantically named rather than incidentally brass-colored), `--color-overlay` (rgba(30,24,17,.72), replacing an unnamed literal `--backdrop-opacity` in the round-loss modal, derived from the design's own darkest on-table hue rather than a generic black), `--color-surface-raised` (an explicit name for the parchment-gradient "the one light object on the table" role bid-marker.scss already described). `--color-sea`/`--color-sea-dark` are an honest, documented alias to the existing dark on-table ambience tokens: the approved design contains **no blue or navy anywhere** (confirmed by scanning every literal hex value in all three reference files) — inventing one to fill a checklist name would have been exactly the kind of fabrication this task said not to do, so the semantic slot exists without a fabricated hue. Applied throughout: `arc-seat.scss` (identity-tile color, "rolled" status color, active-bidder name now `--color-ivory` for the same near-white emphasis the design gives it, previously just `--color-cream` like every other name), `bid-marker.scss` (radius), `turn-timer.scss` (`--color-warning`), `round-loss-modal.html`/`.scss` (`--color-overlay`), plus a small dead-code cleanup (`bid-picker.html`'s `rounded-xl` Tailwind classes were confirmed via computed-style inspection to never actually apply — the shared `onboard-control` mixin's own 16px radius always wins the cascade — so the misleading unreachable classes were removed rather than the shared, widely-reused mixin value changed just for one instance). One reviewed-and-preserved divergence from the literal mockup: the bid-picker stepper buttons are 44px tall, not the design's literal 38px — kept at 44px because that is the WCAG/iOS minimum touch-target size and this task's own accessibility section explicitly asks for adequate touch targets, which takes priority over an exact pixel match to a static mockup. Likewise the disabled-button treatment (a solid muted color, not the design's translucent fade) was reviewed and intentionally kept as an earlier, reasoned accessibility decision (a translucent disabled state reads as merely quiet, not clearly disabled) rather than reverted to match the mockup literally. **Assets (this and the immediately preceding pass):** audited `designs/assets/` against what was actually wired — dice sprite (`dice-sprite.png`) was live but per-face art (`die-face-1..6.png`, already copied to `client/public/assets/dice/`, higher quality/more textured) sat unused; populated `DICE_FACES_CONFIG[].imageUrl` with it (the config's own designed highest-priority override point, confirmed zero component changes needed — `ui/die/die.ts`'s 3-tier fallback already existed). Cup art (`cup-open-top/closed-side.png`) is wired into `dice-cup.scss` but its render path (`SeatCard`/`DiceCup`) is dead code — permanently `class="hidden"` in `table.html`, superseded by the mobile-first board (now the only board shown, even on desktop, inside a phone frame) from an earlier mobile-board-migration pass; flagged for the user rather than silently deleted or resurrected. Table/lobby background PNGs (`designs/assets/bg/`, 1.5–10MB each) were deliberately **not** wired in — visually near-identical to the existing zero-weight procedural CSS gradient (confirmed by direct comparison), so multi-MB downloads for no discernible visual gain; documented rather than integrated. Badges (`badge-won.png`/`badge-lost.png`) were already wired and confirmed rendering live (winner screen, round-loss modal). **Typography, this pass:** sourced and self-hosted two real SIL OFL-1.1-licensed fonts from the Google Fonts repository (license text verified alongside each file, never a remote/CDN load) — Pirata One (`--font-heading`: game title, major headings, round-result banners only) and EB Garamond, a variable font 400–800 (`--font-body`: everything read for precision). Files + a license/usage `README.md` live in `client/public/assets/fonts/`. Auditing every existing `--font-heading` usage against the new guidance found and fixed several real conflicts the previous (system-font-fallback-only) styling had silently gotten away with: bid quantities (`bid-picker.scss`), the current-bid badge (`bid-marker.scss`), room codes (`entry.scss`'s OTP input, `lobby.scss`'s code display), primary/secondary buttons (`_mixins.scss`'s `pill-action-button`, `lobby.scss`'s share/ready buttons), and opponent identity-tile initials (`arc-seat.scss`, `bid-controls.scss` — a single blackletter capital reads as a near-abstract shape, confirmed visually) all now correctly use `--font-body`; only genuine headings/banners/the wordmark still use `--font-heading`. **Bugs found and fixed via a real multi-viewport/multi-state Playwright screenshot review (not simulated):** (1) the mobile reveal recap stayed visible through the *entire* following round, stacked above the next round's own "Roll your hand" button — `GameStore` now clears it the moment I roll my own hand for the new round; (2) losing a die to the turn timer (a pure stall, 5.7) had **zero** client-side feedback at all (unlike a call-liar loss) — confirmed via a real ~56-second wait through the actual server-authoritative timer; added `GameStore.lastTimeout` and a second trigger path in `RoundLossModal` with its own "Time ran out" content branch, verified live. Also re-confirmed and closed two stale `ISSUES.md` items: the 320px `.bid-controls__suggestions` overflow (no longer reproduces — page-level `scrollWidth === clientWidth` at 320px through a full live match) and the `table.scss`/`lobby.scss`/`entry.scss` component-style budget warnings (raised `anyComponentStyle` in `client/angular.json` from 4kB/8kB to 8kB/16kB, comfortable headroom above the current worst case, build now clean). **Verified:** `npm run lint`, `typecheck`, `test` (315 tests: 65 shared + 32 server + 218 client, ~30 new/updated this pass), `build` all clean repo-wide; the full registered `npm run e2e` chain (`lobby-flow` + `bidding-flow` + Phase 5's `reconnect-timer-flow`) passes from a genuinely fresh dev-server start, zero console errors; a dedicated ad hoc Playwright review (`client/e2e/phase4-visual-review.mjs` + `-part2.mjs`, not part of the regular suite — real multi-context runs, not fabricated) captured and visually confirmed entry/lobby (1/2-player, mobile+1440px), the full bidding flow at 320/768/1024/1440px, the current-bid badge, 8- and 12-player table layouts (mobile+desktop phone-frame), reveal, next-round transition, the quiet/warning/bank timer phases (real wait, all three visually distinct — neutral/amber/red), the new timeout-loss modal (caught live at the real ~56s mark), the winner screen, and the reconnect invalid-token fallback. A final fresh screenshot pass after the token-derivation work above re-confirmed all of it, plus the corrected identity-tile wood color and badge radius, with no regressions. **Full regression re-verified after the token work specifically:** `npm run lint`, `typecheck`, `test` (315, unchanged — this pass was CSS/token-only, no test files touched), `build` (still clean, no budget warnings) all pass; the full `npm run e2e` chain passes from a fresh dev-server start with zero console errors. **Not done, by deliberate choice, not because it's blocked:** the `SeatCard`/`DiceCup` dead-code question (revive for a real desktop-specific layout, or remove) remains a call for the user rather than something decided unilaterally here — it does not affect the live, rendered interface either way, so it does not block this phase's own "the interface matches the pirate theme" criterion.
- [x] Phase 5 — Reconnect, timers, time bank, edge-cases. `/shared` gained `TurnTimerView`/`StateSnapshot` (`types/timer.types.ts` — a filtered `MatchState` plus `turnTimer: TurnTimerView | null`, attached only at the transport boundary so `GameEngine`'s own `MatchState`/tests never need to know timers exist, 6.3) and two gateway-synthesized events, `PLAYER_DISCONNECTED`/`PLAYER_RECONNECTED`; `selectPlayerView` now takes the timer view as a third argument. `GameEngine` itself needed **no changes** — `applyTimeout` and its double-loss protection already existed from Phase 2 and are reused as-is. `/server` gained `TurnTimerService` (`game/turn-timer.service.ts`): server-owned wall-clock scheduling (0–15s quiet, 15–25s warning, then a 30s personal bank that only ticks while the turn's owner is connected, 5.6/6.5), a generation counter so any stale scheduled callback is a guaranteed no-op even under a queued-mutation race, and a lazy bank-catch-up helper so pausing/resuming across a disconnect never mis-counts consumed time. `RoomsService`'s `RoomRuntime` gained `sessionsByToken` (reconnect tokens — `randomBytes(32).toString('hex')`, never placed in `MatchState`, so 4.5's "never expose tokens" holds structurally) and `timer`. `GameGateway` gained `reconnectToRoom` (restores the same slot by token, replacing rather than duplicating the socket mapping; unknown room/token is always `INVALID_TOKEN`, and an unknown roomId is checked *before* entering the room-creating `runExclusive` path so a bad reconnect attempt never phantom-creates a room) and drives `TurnTimerService` purely by reading each intent's resulting `ServerEvent[]` (never by diffing phases) so the timer is armed/reset/cancelled/extended in lockstep with `BID_PLACED`/`ROUND_STARTED`/`MATCH_WON`/protected `TURN_TIMED_OUT`/`SPECIAL_ROUND_DECLARED` — the 5.5 seven-second bonus is applied to whichever timer is currently active, since a declaration can only ever succeed while the round's first-bid timer is the one running. **Resolved ambiguity (flagged to the user, not silently decided):** 5.6 says the bank is never spent automatically on disconnect, and section 7 says a disconnected player "may return at any time" with no kick/voting mechanism — taken together this would let a permanently-absent active player stall the match forever. Per the user's explicit choice, `reconnectWaitWindowMs` (60s, previously unused) is now a hard fallback: an active player disconnected for 60s straight (regardless of which timer sub-phase they were in) times out via the ordinary 5.7 action, while their reconnect token itself never expires. `/client`: `SocketService` now owns the reconnect session (`localStorage['perudo:session']`, `{roomId, token}`) — stored on every `joined` payload, replayed automatically on socket `connect`, and cleared silently (no user-facing error) if the server rejects it as invalid; `GameStore.matchState` is now typed `StateSnapshot`. New `TurnTimer` UI component (`ui/turn-timer/`) — a pure `computeTurnTimerDisplay` util deriving quiet/warning/bank/expired from server epoch timestamps, and a synthesized Web-Audio beep (no audio asset, matching the project's existing "no remote web-font loading, no invented asset files" stance in `_tokens.scss` and CLAUDE.md 10's one explicit sound exception) fired exactly once per turn on entering the warning phase — wired into the mobile board header, which is now the only board layout rendered (the old desktop-only branch in `table.html` is dead code, superseded by Phase 4's mobile-first rework and shown inside a phone frame on desktop). **Verified:** roughly 34 new tests (`turn-timer.service.spec.ts` unit-level with fake timers covering start/cancel/extend/disconnect-freeze/reconnect-resume/hard-fallback/generation-staleness; `game.gateway.spec.ts` gains a full Phase-5 integration suite — reconnect restores the correct filtered slot with no duplicate player, invalid/unknown tokens rejected, tokens never appear in any broadcast, timer arms on BIDDING/resets on bid/cancels on round-end, a stale scheduled timeout genuinely does nothing once a bid beat it, timeout removes a die and moves the match on, double-loss protection re-arms a fresh timer for the next player, the special-round bonus extends the right timer, the hard disconnect fallback fires, and one room's timeout never touches another's; `turn-timer.util.spec.ts` and a `TurnTimer` component spec on the client) plus all pre-existing shared/server/client tests, still green (300 total across the repo). A new Playwright script (`client/e2e/reconnect-timer-flow.e2e.mjs`, added to `npm run e2e`) drives two real browser contexts through a real reload — reconnect token generated/stored/never rendered, dice privacy and active-bidder identity preserved across reload, invalid-token fallback to Entry with no stuck page — alongside the pre-existing `lobby-flow`/`bidding-flow` scripts, all passing with zero console errors. **Deliberately not done here:** a full visual/typography pass (new blackletter/serif webfonts, pixel-matching a Claude design mock) — that's Phase 4's own explicit scope (still unchecked above, pending real Figma tokens) and would contradict `_tokens.scss`'s current documented "no remote web-font loading" decision; the timer badge and reconnect flow use the existing token set only. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all verified clean repo-wide.
- [x] Phase 6 — Final documentation and deploy preparation. Brought all four `README.md`s (root, `/client`, `/server`, `/shared` — already existed as Phase 1 stubs) up to date with everything Phases 2–5 actually added, none of which they mentioned before this pass: the client's `e2e`/`e2e:render` npm scripts (present in `package.json`, absent from the docs entirely); the self-hosted fonts (`client/public/assets/fonts/`, Phase 4); `TurnTimerService` and reconnect-session bookkeeping (`server/src/game/`, Phase 5); `timer.types.ts` and the dice-face `imageUrl` config (`/shared`, Phases 4/5). Root `README.md` gained a dedicated "End-to-end tests" section (what `npm run e2e` actually exercises — two real browser contexts over a real socket, plus the reconnect-token reload flow — and how it differs from `npm test`'s deterministic fake-timer suite) and a "Known issues" section linking `ISSUES.md`. The "Deploy" section stays a deliberate, explicit **stub** — no host was chosen; per section 12 that decision belongs to the user, not this pass, so it was documented as an open placeholder (what it will contain once a host exists) rather than invented. Both of section 12's open questions (test hosting provider/method; the minimum-first-bid-quantity-1 default) remain genuinely open — not closed here. **Verified:** `npm run lint`, `typecheck`, `test` (315, unchanged — documentation-only pass, no source files touched), `build` all clean repo-wide; the 4 edited/rewritten README files individually pass `prettier --check` (the wider repo's pre-existing `format:check` drift — design-mockup `.dc.html` files under `/designs`, and this file's own long-established one-paragraph-per-phase-entry convention — predates this pass and is unrelated to it, left untouched). Done-when criterion ("someone unfamiliar with the project brings it up locally using the README alone") is met: prerequisites, install, run, every significant script, and how to actually play (open `:4200`) are all present and accurate in the root README, cross-linked to the package-level ones for anything package-specific.
- **Addendum (2026-08-29, outside the original 6-phase roadmap) — configurable server timing.** A runtime extension (3.4) was added on top of the completed roadmap: `TimerConfigService`/`server/perudo.config.json` for server-operator startup defaults, plus a `setTimerMode` socket message for a per-room runtime toggle. It arrived in the repo already broken and was fixed in the same pass it was discovered: `TimerConfigService` was never registered in `GameModule`'s providers, so the real server crashed on boot with `UnknownDependenciesException` (masked by every test, which constructs the dependency by hand instead of going through DI) — fixed by adding it to the module. `setTimerMode` was originally a global, unauthenticated file write with no room scoping (any client could silently disable timers for every room on the server) and no live effect until a full restart — reworked into a proper per-room in-memory override (`RoomRuntime.timerEnabled`, `server/src/game/rooms.service.ts`) that takes effect immediately and never leaks across rooms; `perudo.config.json` moved from the repo root to `server/`, where the server's own `process.cwd()` actually resolves it from every real start path. Full detail and the config file format live in `TIMING_CONFIG.md`; the bugs themselves are logged in `ISSUES.md`. **Verified:** `npm run lint`, `typecheck`, `test` (320: 65 shared + 37 server + 218 client, +5 new gateway tests for the per-room toggle), `build`, and a real server boot (`ts-node src/main.ts`, both before and after the `GameModule` fix) all confirmed directly, not assumed.
- **Addendum (2026-09-04, outside the original 6-phase roadmap) — reveal-panel design-parity pass, plus a state-fixtures/save-restore plan.** Two asks: (1) plan (not build) a way to render app states from config and a game-save/restore feature — logged in `STATE_FIXTURES_AND_SAVE_PLAN.md` and `ISSUES.md`; the fixture idea is low-risk client-only future work, while true save/restore across a **server restart** is flagged as an open question since it directly reverses §3.3's documented "no DB" decision, not decided here. (2) Primary priority: compare the live UI against a design reference the user provided (`screens/Screenshot 2026-08-16 002742.png` — a claude.ai/design-style mockup; `DesignSync` itself had no usable session in this environment, `/design-login` needs to run interactively first) against a matching live capture (`client/e2e/render-states.mjs`'s `reveal-after-call-liar` state) — the mobile reveal recap (`table.html`'s `.mobile-reveal`) was the clearest gap: a dark on-table panel where the reference used a light, elevated "verdict surface" (the same visual language `theme/_mixins.scss`'s `outcome-card` already established for the winner screen and `RoundLossModal`, reused here via matching tokens rather than through that mixin itself, since this panel is seen by every player after every reveal regardless of who lost — not framed around one viewer's win/loss the way the mixin's two variants are). Restyled to the parchment/ink/verdict-pill token set; added two content lines the reference had and the app didn't (`table.ts`'s new `nextRoundSummary` computed): the ringed-dice/aces-wild caption, and a closing "`<loser>` drops to N dice · next round opens with `<player>`" (or "`<loser>` is out" on elimination — a real `0`-dice case, handled explicitly rather than falling through a truthy check). Deliberately did **not** add a duplicate "Next round" CTA button to the card itself — the existing "Roll your hand" button already serves that role, and a second action risked confusing rather than clarifying. `render-states.mjs` gained a `reveal-card-only.png` capture (a tight crop of just the card, so a design comparison isn't at the mercy of wherever the inner scroll happened to land) rather than leaving a throwaway comparison script behind. **Verified:** a real two-browser-context Playwright run through lobby → roll → bid → call liar → reveal, screenshotted and visually compared against the reference (sent to the user directly); `npm run lint`, `typecheck`, `test` (320, unchanged count — no test file needed new cases for presentational computed values already exercised indirectly through existing table rendering assertions), `build` all clean repo-wide. **Scope note:** this pass covers the one state that came with a concrete mockup to compare against (the reveal card); "very high-end pixel-perfect" across every other screen is a much larger, open-ended effort not attempted wholesale here — the same comparison method (a design reference + `render-states.mjs`'s per-state captures) is ready to repeat for any other screen the user points at next.
- **Addendum (2026-09-04, same day, follow-up) — built the fixture-mode half of the plan above.** The user asked to build what was planned; §1 of `STATE_FIXTURES_AND_SAVE_PLAN.md` (dev-only state-fixture preview mode) was built, §2 (true save/restore across a server restart) was **not** — it still needs the user's explicit sign-off to reverse §3.3's "no DB" decision, so it stayed a plan-only open question. Shipped: `client/src/app/core/fixture-loader.ts` (a `?fixture=<name>` query param, read via a `provideAppInitializer` in `app.config.ts` so it resolves — populating `GameStore` — strictly before the app's first render, which is what keeps `SocketService.connect()` from ever firing for a fixture load: Entry, the only place that calls it, never gets a chance to mount); `client/e2e/capture-fixtures.mjs` (captures real `StateSnapshot`/`ServerEvent[]` pairs off the wire from a live match — raw WebSocket frame parsing of the socket.io v4 protocol — rather than hand-authoring fixture JSON); three real fixtures under `client/public/assets/fixtures/` (`lobby-2p`, `bidding-mid`, `reveal-true`); a new `npm run e2e:fixtures -w client` script. Fixture shape carries `events` alongside the `snapshot` and replays them through `GameStore.applyEvents` *before* `setState` — discovered mid-build that the reveal recap and timeout modal are driven by `GameStore`'s ephemeral event-derived signals (`lastReveal`, `lastTimeout`, `lastRevealWasSpecialRound`), not the snapshot alone, so a snapshot-only fixture would have silently failed to reproduce exactly the state (the reveal card) this was built to make easy to review. **Verified:** `fixture-loader.spec.ts` (4 new tests — no-op with no param, correct call ordering on a real load, a 404, a malformed shape, none throwing); a live Playwright check loading all three fixtures confirmed correct rendering with zero console errors and — checked explicitly via `page.on('websocket')` filtered to the game server's own URL — zero real socket.io connection attempted. Full repo `lint`, `typecheck`, `test` (324: 65 shared + 37 server + 222 client, +4 from this), `build` all clean; fixture JSON confirmed present in the production build output (`client/dist/client/browser/assets/fixtures/`) — this project has no `environment.ts` split to gate on instead (same as the pre-existing `?serverUrl=...` override), so that's expected, not a bug, and harmless (small, static, inert with no query param).

- **Addendum (2026-09-04, same day, third pass) — autonomous design-parity loop over the referenced mobile states.** Ran the same design-vs-live comparison method as the reveal-panel pass above, this time looping through every mobile state that has a concrete reference: the reveal card (`screens/Screenshot 2026-08-16 002742.png`), the bidding board (`designs/mobile-lantern.dc.html`, the "answering a standing bid" panel), and the waiting room (`designs/perudo-lobby-lantern.dc.html`). Live states rendered via the fixture loader (`?fixture=lobby-2p|bidding-mid|reveal-true`) and screenshotted at 390×844, then compared side-by-side against the reference. Three concrete, token-only gaps found and closed — no invented values, every change traced to an existing token and to the reference's own literal markup: (1) **`.mobile-reveal` card edge** — was a near-invisible `--color-border` hairline on a flat `--color-parchment` fill; the reference clearly shows a `1.5px solid #d69a52` brass edge on a `#f6ecd8→#e4d5b8` parchment gradient, which is the exact pair `theme/_mixins.scss`'s `outcome-card('win')` already uses — switched to `1.5px solid var(--color-brass)` + `linear-gradient(180deg, var(--color-parchment), var(--color-parchment-dark))` (via the tokens, not the mixin, per the earlier pass's own note about why this panel stays a neutral shell). (2) **`.mobile-reveal__caption`** — the reference sets a hollow ring glyph beside the "Ringed dice counted toward the claim" line (a literal echo of the ringed-die treatment) and renders the text upright; the app had the text only, italicised — added a `16px` brass-bordered circle span (`.mobile-reveal__caption-ring`, matching `ui/die/die.scss`'s `.die--ringed` 2px brass halo) and dropped the italic. (3) **`.mobile-bid-sheet-wrap` top hairline** — `designs/mobile-lantern.dc.html`'s bid tray edges its top with `rgba(255,224,176,.18)` (the warm lantern glow, the same light the mat catches), but the app used the neutral cream `--color-border-onboard`; switched to `rgba(var(--color-lantern-glow-rgb), 0.18)` — the token whose doc comment describes exactly this role. **Deltas found but deliberately left as judgment calls** (logged in `ISSUES.md` → Open, "Design-parity deltas left as judgment calls"): the reveal verdict block's stacked-caps-pill vs the reference's large-Pirata-word style (matched on purpose to `RoundLossModal`'s `.round-loss__verdict` — changing one alone reintroduces an inconsistency); `describeBid`'s "N × face M" vs "N × fives" (shared across 3 templates + desktop banner + 2 asserting tests, and the two reference files disagree on singular/plural); the lobby seat-avatar colour (wood-brown per Phase 4's `mobile-lantern`-based token audit vs `perudo-lobby-lantern.dc.html`'s per-seat brass/sage gradients — the two approved files genuinely conflict); the lobby per-player subline + header back-arrow (added content, no truthful timestamp on the `Player` model); and the reveal-phase round chip wording. **Verified:** `npm run lint`, `typecheck`, `test` (324, unchanged — presentational token/markup changes only, no test file needed a new case), `build` (clean, no budget warnings) all pass repo-wide; before/after captures of the reveal card rendered from the `reveal-true` fixture and sent to the user. No server/game-logic code touched, no persistence added, not committed. **Continued (same session) — entry + opening-roll states.** Entry screen checked against `perudo-lobby-lantern.dc.html`'s "Lobby A" block: already a close match (brass-edged field, terracotta chunky-shadow primary pill, ivory Pirata labels once a nickname is entered, exact tagline text) — the one real gap is the brand badge fill (`.entry__badge` uses the wood-brown `--color-identity-*` gradient; the design's icon tile is a brass-gold `#e3bd7e→#8a5c26` sweep), which is the **same** wood-brown-vs-brass-gold conflict already flagged for the lobby avatars — the two approved reference files genuinely disagree and Phase 4's token audit only checked one, so this stays a user call (ISSUES.md entry expanded to cover the entry badge too). Opening-roll (`opening-roll-after-all-ready` state from `render-states.mjs`) vs `designs/mobile-lantern.dc.html` / `perudo-mobile-board.dc.html`: closed one concrete gap — the "Highest cast opens the round" turn-order caption was neutral `--color-cream-faint`, but `mobile-lantern.dc.html` renders that exact "opens the round" line in `--color-gold-highlight` (the token whose doc comment names this as its sole purpose, "the turn-order kicker"). Added `.mobile-arc__caption--turn-order` (gold), bound only when there is no tie re-roll notice — a tie caption keeps the neutral tone the design kit's "Tie state" note explicitly asks for. The framed/textured look of the hand-strip and picker dice (vs the mockups' flat CSS pips) was reviewed and is correct — it's Phase 4's deliberate per-face Scenario art (`DICE_FACES_CONFIG[].imageUrl`), closer to 8.2's "aged pips on a wood/bone texture" than the schematic mockup. `lint`/`typecheck`/`test` (324)/`build` re-confirmed clean after these changes.

- **Addendum (2026-09-04, same day, fourth pass) — sustained design-parity work on the table, dice and pre-game screens, plus six real bugs found by doing it.** The user asked for continuous iteration toward ~80% visual parity with the approved references, allowing structural markup changes so long as each lives in its own component's template. Method changed from reading literal values out of the `.dc.html` markup to **rendering those files in a real browser and cropping each 390×844 mockup panel** (`designs/*.dc.html` render standalone even without their `_ds` bundle, since the panels are plain inline-styled markup) — giving true pixel references to compare live captures against, instead of inferring from source. **Bugs found and fixed** (all reported or confirmed by the user during the pass): (1) **dice rendered with a ring of dead space and a phantom double border** — `die-face-N.png` is a 156px canvas whose die body occupies only the middle 110px (23px transparent padding a side, measured off the asset), *and* `.die` painted its own ivory body + inset shadow underneath the art, which showed through that padding as a second die edge; added `.die--art` (wrapper stops painting a body) and `.die__art` (scaled 156/110 and re-centred so the body is full-bleed), including `max-width: none` because Tailwind's preflight `img { max-width: 100% }` silently clamped the rescale back. (2) **Dark vertical bands down both sides of the table** — `styles.scss`'s global `--app-gutter-x` inset `.table-surface` ~24px a side while the `position: fixed` bid tray was *not* inset, so the tray visibly overhung the mat; the table screen now zeroes the ion-content gutter and relies on its own `p-3`. (3) **The mobile board never showed an opponent's dice count anywhere** — genuinely missing information, not just a visual gap; added the reference's per-seat dot row (`ArcSeat.diceDots`, suppressed during the opening roll where the public die occupies that slot and every seat still holds five) plus its "Bid placed" pill for the seat holding the standing wager. (4) **~80px of dead mat between the arc and the wager token at 1-2 opponents** — the arc box reserved a fixed 176px for a sine curve that has no vertical spread below three seats; now two heights. (5) **The player's dice floated ~85px above the bid tray** — `.table-surface--bid-sheet-open`'s `padding-bottom` was a hand-tuned 420px against a tray that actually renders at 335px; replaced with a live `ResizeObserver` measurement (`--bid-sheet-height`), with the constant kept only as a first-frame fallback. (6) **"You drops to 4 dice"** in the reveal summary — `nicknameFor` renders the local player as "You", which takes a plural verb. **Design-parity changes:** Cast/"Roll your hand" were the only primary actions in the app that never picked up `pill-action-button`, so they rendered as bare rectangles next to a tray full of pills; mat glow corrected to the reference's own `.20` alpha and its distinct deeper-gold rgb (new `--color-mat-glow-rgb` token — the design uses two different warm values here, not one); the opening-roll die slot is now dashed-while-waiting per that slot's own design note; the hand zone is bottom-anchored with the reference's warm hairline above it; the roll-stage spacer collapses when a reveal recap is competing for the same screen. **Pre-game screens:** the room-code card carried ~56px of permanently-reserved empty space (two aria-live status lines that only ever spoke one at a time — merged into one that renders only when it has something to say); roster avatars were 16px-radius on 36px, i.e. visually circles, now 38px at `--radius-die` like the reference; a 12-seat table drew ten identical dashed open-seat rows that buried "I'm ready" a full screen below the fold (capped at four with a "+N more seats open" summary, and the CTA is now sticky); the join screen's OTP slots were near-square and are now portrait like the reference, "Join table" is bottom-anchored, and the code length is stated once in the subtitle rather than twice, moving into the control's own accessible name. **Winner screen** was a centred card on the app's light canvas — every reference draws the end cards as bottom sheets over the dimmed table, so it now is one, with the win-specific kicker ("The table is yours"). It was also a **dead end**: the reconnect token outlives the match, so reloading restored the same finished game; added `SocketService.leaveMatch()` + `GameStore.resetMatch()` and a single "Back to the entry" action. Deliberately **no** "Play again" — that would need a server intent the engine doesn't define (6.2), and this pass touched no server or game-logic code. **Verified:** `lint`, `typecheck`, `test` (338: 65 shared + 37 server + 236 client, +22 new/updated this pass — arc-seat dots/pill, die art tier, lobby seat cap and merged status, winner exit and kicker, reveal-summary conjugation), `build` (clean, no budget warnings after raising `anyComponentStyle` to 12kB/20kB for the legitimately large `table.scss`, same precedent as the earlier 4→8kB raise) all pass repo-wide; the full `npm run e2e` chain passes with zero console errors (`lobby-flow` updated for the merged status selector). `src/test-setup.ts` is new — a `ResizeObserver` stub, since the unit-test DOM has none and the tray measurement needs one. **Also this pass:** an audit of every `<ion-button>` in the app found the "Declare special round" (Palafico, 5.5) control still wearing Ionic's stock `color="warning"` palette with no class at all — the last control not on the theme's own pill system; it is now a brass outline pill, deliberately secondary to Place bid / Call liar. The round-loss modal's "Close" had the same problem and now matches, and its claimed-vs-actual pair became the two equal stat tiles every reference end card uses instead of a label above a marker with a loose "Actual count: N" sentence below it (new `--color-ivory-rgb` token for their translucent ivory fill, following the existing rgb-triplet convention). The reveal/loss summary's starter clause now reads "you open the next round" rather than "next round opens with You". **Tooling kept, not left as debris:** `client/e2e/design-compare.mjs` (+ `npm run design:compare -w client`, documented in `client/README.md`) consolidates the method this pass used — crop a design panel, screenshot the matching live state through the fixture loader, compose them side by side, and a `viewports` mode that shoots 320/390/768/1440 and fails on horizontal overflow or console errors. That last mode is how this pass confirmed no overflow at any supported width across the bidding, lobby, reveal and 12-player states.

- **Addendum (2026-09-04, same day) — the canonical design reference was named, superseding an earlier assumption.** The user confirmed that **`designs/perudo-mobile-consolidated.dc.html` is the basis for the design**. Its eight panels (nickname, room code, lobby, opening cast, hand roll, waiting, your bid, reveal) cover the whole flow, and where it disagrees with any other file under `/designs`, it wins. This **supersedes Phase 4's note above** calling `designs/mobile-lantern.dc.html` "the canonical lantern cabin table scene" — that file is one scene, not the flow, and several token decisions traced to it alone were made on an incomplete basis. `ISSUES.md` now states the hierarchy at the top; anything still justified by `mobile-lantern.dc.html` alone is worth re-checking. **What it settled, all previously logged as open "two approved files disagree" judgment calls:** (1) **Player identity colour** — the lobby roster avatar is a 38px *circle* coloured by role, not identity: solid `--color-terracotta` for the local player, translucent cream for everyone else. The wood `--color-identity-*` pair belongs to the table's cup silhouettes; the two are different objects, which the earlier cross-file comparison had conflated. Phase 4's claim that "the old brass-toned identity gradient matched no colour in the approved design" was written having checked only one file and is wrong as stated. The entry-screen brand badge (same gradient, but a logo mark rather than an identity tile) is the canonical file's lit terracotta circle — corrected from the brass square set earlier the same day, which had itself corrected a near-invisible wood version. (2) **Reveal verdict** — a large display-face word with the reasoning inline beside it, not a small caps label stacked in a pill; the "false" variant is a warm rust (`#8c491a`, exactly `--color-brass-deep`), not an alarm red, since losing a die is the game working rather than an error. The loser sentence folds into that inline text, retiring a separate bold line that had been saying the same thing twice (new `revealLossSentence`, which states only who it cost — `revealOutcomeText` restates the reasoning and would have duplicated it inline). (3) **Bid wording** — "4 × fives", plural face names, via a `FACE_WORDS` table, replacing "4 × face 5" across the three table templates and the desktop banner. (4) **Round chip** — "Round N · revealed" during a reveal rather than the dice count, which by then has already changed to reflect the loss the player is still reading about. (5) **Roster subline** — the canonical lobby row has none, so the "Host · set the rules" second line simply isn't part of the design; this also retires the concern that `Player` carries no timestamp to render it truthfully. **Also corrected against it:** the room-code card was borrowing `outcome-card('win')` (the end-card parchment-under-brass treatment), giving an invite card the visual weight of a match result — the canonical draws it as a flat bordereless panel; its label is a muted `--color-meta`, not rust brass-deep; a copy/share success reads green (`--color-sage-deep`) rather than brass; and the roster shows **one** generic "Open seat" row rather than one per free seat (the "N of M" count above already states how many), which also retires the cap-at-four-plus-summary workaround added earlier the same day. New `--color-cream-rgb` token, following the existing rgb-triplet convention, since the references lean on translucent cream at alphas that don't map onto the named `--color-fill-onboard-*` steps. **Still open and logged in `ISSUES.md`:** the reveal is composed as a panel inside the table where the canonical makes it its own screen (card at top, "Next round" pinned at the bottom) — a real rework, not a token change — plus a short list of straightforward not-yet-aligned items (arc-seat cup silhouette, wager caption, hint-chip format, mm:ss timer, entry field/actions). **Verified:** `lint`, `typecheck`, `test` (337: 65 shared + 37 server + 235 client), `build` clean, full `npm run e2e` with zero console errors, and no horizontal overflow at 320/390/768/1440.

*(the agent marks `[x]` and appends a short note about the state under each item)*

---

## 2. PROJECT OVERVIEW

A networked (not hotseat) game of Perudo (Liar's Dice / Dudo) for **2–12 players**, themed "Pirates of the Caribbean". Each player connects from their own device. The MVP goal is a fully playable match cycle from room creation to determining the winner. No deep visual polish, no bots, no OAuth, no video.

**Three fundamental principles:**
1. **The server is the single source of truth.** The client only sends *intents* and renders the state the server sends. The client never computes outcomes and never owns randomness or timers.
2. **Domain logic is isolated from transport.** The `GameEngine` knows nothing about Socket.io, HTTP, or Angular — it runs and is tested in a vacuum.
3. **Data, not hardcode.** All game constants, dice structure, and text live in one place, not as magic numbers scattered through the code.

---

## 3. ARCHITECTURE AND STACK

### 3.1 Monorepo
```
/perudo-game
  /client    → Angular 21 (standalone components + Signals) + Ionic 9 + Tailwind CSS
             → Capacitor: web + Android + iOS from a single codebase
  /server    → NestJS + Socket.io (@WebSocketGateway) — authoritative game logic
  /shared    → shared TS types, phase enums, rules constants, PURE functions (bid validation/comparison)
```

### 3.2 Role of each package

**`/shared` — the contract between client and server.** It contains:
- All TS types for game state and events (intent interfaces and server-message interfaces).
- The game-phase enum (state machine, 6.1).
- The single rules-constants config (3.4).
- **Pure functions** with no side effects: bid-legality validation, bid comparison on the scale with aces conversion (5.4), counting actual quantity including wilds.
- These functions are imported by **both client and server**: the server applies them authoritatively, the client uses them for instant UI pre-validation and hints (5.8). Written once, no logic duplication.

**`/server`** — orchestration: holds room state, applies intents via `GameEngine`, manages timers, broadcasts filtered state. The Socket.io layer is thin.

**`/client`** — presentation: components read state from a single store (Signals), send intents through a service layer. **Components never talk to Socket.io directly** — only through a service wrapper.

### 3.3 State model and storage
- Match state lives **in server memory** (a Map keyed by roomId). On server restart, active matches are lost — this is a **deliberate MVP limitation**; do not add a DB/Redis.
- Reconnect tokens and player slots live in that same in-memory room state.
- **All state mutations for a single room are serialized** — process one room's intents strictly one at a time to eliminate race conditions.

### 3.4 Centralized rules config
All constants live in one module in `/shared` (e.g. `rules.config.ts`), with **no magic numbers in logic**:
- starting dice per player: 5
- players: min 2, max 12
- quiet turn phase: 0–15,000 ms
- audible ("yellow") turn phase: 15,000–25,000 ms
- base turn timer: 25,000 ms, after which the bank is spent
- personal extra-time bank: 30,000 ms (fixed, no regeneration in MVP)
- special-round bonus timer: 7,000 ms
- shake gesture: max 5,000 ms; stillness threshold to commit: 500 ms
- reconnect wait window: 60,000 ms
- (dice-face structure is a separate config, see 8.2)

**Runtime override (added after Phase 6, outside the original spec — full detail in
`TIMING_CONFIG.md`):** the turn-timer values above are the compiled-in defaults, but
`server/perudo.config.json` (loaded once at server startup, server-operator-set, never written to
by any client) may override them, including disabling timers entirely by default
(`enabled: false`). Independently, any player can flip timers on/off for **their own room only**,
at any time, via the `setTimerMode` socket message — an in-memory `RoomRuntime.timerEnabled`
override (`server/src/game/rooms.service.ts`) that takes effect immediately and never leaks into
another room. This doesn't change what "centralized" means here — there is still exactly one
place (`RULES_CONFIG`, plus optionally `perudo.config.json`) that owns these numbers; they're just
now overridable rather than purely load-bearing constants.

### 3.5 Extensibility — build it in NOW
The project will grow to include bots, 3D dice, and avatars (section 13). To avoid rewriting the core later, make structural decisions with them in mind already:
- **`GameEngine` is driven by an abstract source of intents, not by a socket.** A human behind Socket.io and a future bot are just different sources of the same intent interface. Do not couple applying a move to the presence of a socket connection.
- **Dice rendering is swappable** (config-driven, 2D now → potentially 3D later).
- **The player model leaves room for an avatar** (optional field) without a schema break, even though the MVP uses only a nickname.

---

## 4. ENGINEERING STANDARDS (global)

### 4.1 Code quality
- TypeScript **strict** everywhere. `any` — only with a written justification in a comment; disallowed by default, prefer `unknown` + narrowing.
- Explicit return types on all functions.
- Target **≤ 50 lines per function**; longer → decompose.
- ESLint + Prettier with a single config across the monorepo, from the first commit. At the end of a phase, code passes lint with no errors.
- Naming: booleans — `is`/`should`/`has` prefixes; event handlers — `handle` (`handleBidSubmit`). Types — PascalCase.
- No commented-out code or `console.log` debris at the end of a phase.

### 4.2 Error contract
- An invalid intent **must never crash the server**. The response is a structured error event (code + message); state does not mutate.
- Define a single error type in `/shared` plus codes: `NOT_YOUR_TURN`, `ILLEGAL_BID`, `WRONG_PHASE`, `ROOM_FULL`, `INVALID_TOKEN`, etc.

### 4.3 Testing (differentiated by importance)
- Test infrastructure is set up in Phase 1: Vitest (client) / Jest (server + shared).
- **Domain logic (`GameEngine`, pure functions in `/shared`) gets meaningful unit tests** — it's the most error-prone part. Special attention to the bid validator with aces conversion (5.4): all transitions + the boundary cases from the worked examples.
- UI tests in the MVP — minimal.
- Domain-logic tests are **deterministic**: RNG is injected (6.4), time is controllable.
- **Do NOT test the random dice generation itself** (no point testing the RNG distribution); test the logic that operates on given dice values.

### 4.4 Definition of Done for a phase
Builds; lint and typechecker are clean; the phase's level of tests is green; committed; "Phase Status" records what was done; the phase's readiness criterion is met.

### 4.5 Fairness / anti-cheat (MVP level)
- **The server sends each player only their own dice** until reveal. Other players' dice never leave the server until the round is revealed. This is correctness, not polish.
- The reconnect token is sufficiently random (not guessable).
- Timers are server-authoritative (6.5).

---

## 5. GAME RULES

### 5.1 Match setup
- A player creates/joins a room by code or link, enters a nickname (anonymous session, no registration).
- Avatars are not in the MVP — nickname only (the model is extensible for an avatar, 3.5).
- Lobby: list of connected players, each presses "Ready". The match starts when all are ready.

### 5.2 Starting round (who goes first)
- Each player **openly** rolls 1 die (with a roll timer).
- Highest value goes first. On a tie — re-roll among the tied players.
- Others wait.

### 5.3 Game round
- Each player has 5 dice (the count decreases as they lose rounds).
- Dice are rolled hidden; a player sees only their own and does not re-inspect them until the round ends.
- Dice are generated **on the server** at the moment the shake gesture completes on the client (the client only triggers the request).
- Players call bids in turn as "quantity + face"; a bid refers to the **sum of dice of ALL players at the table**.
- A bid must **monotonically increase** on a single scale (5.4). Going back / repeating is forbidden.
- Each next player either raises the bid or calls "liar" (не верю).
- **The first bid of a round** may be any face, including aces, with no restrictions; **minimum — quantity 1** **[DEFAULT — confirm]**.
- On "liar" — everyone reveals, the actual quantity is counted against the last bid (with wilds, 5.4).
- If actual **≥** claimed — the caller loses. If **less** — the bidder loses. (Exact match → the caller loses; there is NO special "spot on" bonus.)
- The loser loses one die. The loser goes first next round; if already eliminated (0 dice) — the next player in order after them goes first.

### 5.4 Aces (wild) and the conversion scale — EXACT FORMULA
Aces are wild by default: at count time they count as any claimed face. Bids across different faces are compared on a single monotonic scale. The validator is a pure function in `/shared`, and it MUST be covered by tests for every point below.

**Direction "normal face → aces":**
- aces quantity = `ceil(normal_quantity / 2)`.
- Example: 4 fives → 2 aces (4/2 = 2).

**Direction "aces → normal face":**
- base normal quantity = `aces_quantity × 2` (NO "plus 1"). This applies to ALL faces equally, including sixes.
- the bid must still be a **strictly legal raise** over everything already bid (monotonicity) — you cannot reproduce a bid that already occurred.
- **Conditional sixes rule (collision only).** Six is the highest face; there is nowhere to "grow by face". Therefore: if the base `aces_quantity × 2` for sixes yields a bid that **already occurred** (an illegal repeat) — and only in that case — apply `(aces_quantity + 1) × 2` to jump to the next available level. If the base `×2` for sixes has not occurred and is legal — use it as is, with no +1.

**Worked examples (authoritative test cases; the implementation MUST satisfy them):**
1. Was `4 fours` → `2 aces` → player wants fives → `2×2 = 4 fives` — **legal** (face 5 is higher than 4, quantity 4 passes).
2. Was `3 sixes` → `2 aces` → player wants sixes → base `2×2 = 4 sixes`. Four sixes has not occurred ⇒ use **4 sixes**, the conditional rule does NOT activate.
3. Was `4 sixes` → `2 aces` → player wants sixes → base `2×2 = 4 sixes` already occurred ⇒ the sixes rule activates: `(2+1)×2 = 6 sixes`.
4. Was `4 fives` → `2 aces` → "4 of anything below six" is **forbidden** (covered by four fives); for sixes — base `4 sixes` if it has not occurred.

**Important for implementation:** legality depends not only on the last bid but also on which normal face the switch to aces came from (see example 4). So the validator/state must track the round's bid history enough to correctly handle returning from aces (at minimum — the face/quantity of the normal bid that preceded the switch to aces). The client holds the same history for pre-validation (5.8).

### 5.5 Special round (Palafico-like)
- Available to **any** player with exactly 1 die (several may qualify at once).
- Can only be declared **before the first bid of the round**; once the first bid is placed, the window is closed until the next round.
- If declared during the first-bid timer — the round's first player gets a **7-sec** bonus timer.
- If declared by anyone — the rule applies **for the whole current round for everyone**: aces stop being wild, and the bid face cannot be changed (quantity may only be raised).
- It does not carry over to the next round — it must be declared again.

### 5.6 Turn timers and sound
Sequence for the player whose turn it is:
1. **0–15 sec** — quiet, the player thinks.
2. **15–25 sec** — a **sound signal** (beeping), the "yellow zone", warning that time is running out.
3. **After 25 sec** — the **personal bank (30 sec)** starts to be spent.
4. **Bank exhausted** — the timeout action fires (5.7).

The bank is spent only by a present (online) player as a continuation of the turn; on disconnect the bank is not spent automatically, but the turn timer runs (section 7).

### 5.7 Turn timeout and double-loss protection
- When all time (25 sec + 30-sec bank) runs out and the player **has not placed a bid and has not called "liar"**: they **lose one die** (as a round loss), the round ends, and play moves on.
- **Double-loss protection:** a die cannot be removed by timeout **two rounds in a row** for the same player. If a player "stalls" (places no bid) a second round in a row — the second time they do **NOT** lose a die; the turn simply passes to the next player.
- The protection applies **only to a pure stall** (no bid at all). If the player placed a bid and lost it via "liar" — the die is lost as usual, even two rounds in a row. The immunity is strictly about inaction, not an honest loss.

### 5.8 Bid UI: hints + hybrid validation
The bid interface helps the player and validates input in two layers.

**Hints (always visible to the player):**
- **The minimum legal bid** — available in one click.
- **Switch to aces** — if the current bid is on a normal face, show the minimum legal aces bid (per conversion 5.4), one click. If the switch is currently impossible — the button is disabled/highlighted as unavailable (the player always sees its state).
- **Switch from aces to a normal face** — symmetric, if the current bid is on aces (respecting the sixes rule).
- **Free input** — the player sets quantity + face themselves.

**Validation — two layers, the same function from `/shared`:**
- **Client pre-check, instant.** The client imports the pure validation function and highlights legal/illegal in real time before sending. For this the client holds the round's bid history (see 5.4). No server round-trip on each input change.
- **Authoritative server check on submit.** The intent goes to the server, the server re-checks the same function; on rejection — an `ILLEGAL_BID` error. The client is not trusted.

(No real-time validation via socket before submit — local pre-check is sufficient and instant; the server check is needed once, at bid commit.)

### 5.9 Win condition
- The last player with dice remaining wins.

---

## 6. TECHNICAL DOMAIN MODEL

### 6.1 Explicit state machine (mandatory)
Model the round/match as an **explicit finite state machine**, not a pile of `if`s:
```
LOBBY → START_ROLL → ROUND_ROLLING → BIDDING → REVEAL → ROUND_END → (next round's BIDDING | GAME_OVER)
```
- Within `BIDDING` there is a sub-state "special-round declaration window open" — before the first bid.
- Each intent is legal only in specific states; otherwise — `WRONG_PHASE`. Define a "state × allowed intents" table.

### 6.2 Intent set (all validated on the server)
`joinRoom`, `setReady`, `rollDice` (shake), `placeBid`, `callLiar`, `declareSpecialRound`, `reconnect`. (No voting — see section 7.) Never trust the client on whose turn it is or on action legality.

### 6.3 Engine isolation
`GameEngine` — a class/module with no transport imports. Input: state + intent + (injected) RNG. Output: new state + a list of events to broadcast (who gets what). The Socket.io layer only relays.

### 6.4 Injected RNG (mandatory)
Dice generation is behind an interface (e.g. `DiceRoller.roll(): number`), with the implementation supplied from outside:
- **In production — a cryptographically fair generator** (`crypto.randomInt` in Node.js): fast, statistically even, without the bias of a naive `Math.random() % 6`, no "hallucinations". **Do not use an LLM/AI to generate dice.**
- **In tests** — a deterministic/seeded implementation with a fixed sequence.
- **Never call the generator directly in logic** — only through the interface, otherwise the engine is untestable.

### 6.5 Server-authoritative timers
- Time-keeping belongs to the server; the server decides when time is up and applies the timeout action (5.7).
- The client shows the countdown and plays the "yellow zone" sound as a **visual/audible estimate**, synced from the server; the client cannot extend its own time.
- The bank is spent by an explicit continuation of a present player's turn (5.6).

### 6.6 State synchronization with the client
- On every change the server sends the player a **filtered snapshot** of state (full, but other players' dice hidden until reveal). A full snapshot is simpler and more robust than diffs for the MVP.
- The UI is **pessimistic**: an action is applied after server confirmation.

---

## 7. RECONNECT / DISCONNECT AND STALLING (NO voting)

A single mechanism for both a disconnected player and an online player who "stalls":
- The client stores a local session token; on re-entry the server returns the player to the same slot with the same state by token.
- If a player (disconnected or simply silent) does not act — the normal turn timer runs: 25 sec (with the "yellow zone" and sound) + a 30-sec bank.
- Time up → the timeout action (5.7): lose a die, with protection against two losses in a row for a pure stall.
- **No voting (50%/70% etc.) — this mechanism is removed entirely.**
- The player remains part of the match and may return at any time; they are eliminated naturally when they run out of dice.

---

## 8. UI/UX AND GRAPHICS

### 8.1 Tools
- Mockups/design tokens — Figma (tokens → Tailwind config). 2D assets — Scenario, per an art bible; ready-made prompts are in `scenario-prompt-brief.md` (if the file is in the repo). **The agent does not generate assets — it only integrates ready files.**
- Ionic — structure/navigation/interactive elements; Tailwind — the "pirate" theme on top. Angular Material is excluded.

### 8.2 Dice
- **2D illustration** (a flat face), no 3D and no Three.js/Babylon on the client.
- The shake gesture is a cosmetic CSS animation; the final result comes from the server (no pseudo-hints in the animation).
- Faces: aged classic pips on a wood/bone texture; six is a standard six-pip face (no skull or other substitute glyph on any face).
- **The dice structure is configurable** (faces, visual values, counting rules — as data), the rendering is swappable (3.5).

### 8.3 Table layout (2–12 players)
- An adaptive "around an oval table" layout: your own player is always at the bottom center (larger), the others are distributed along an arc; the number of seats equals the current number of players (not a fixed 12-seat grid with empties).
- With 8–12 players the cards shrink proportionally; when space runs short the top row goes to horizontal scroll rather than shrinking to illegibility.

---

## 9. ROADMAP

### Phase 1 — Monorepo skeleton and quality infrastructure
**Goal:** a working skeleton and quality infrastructure, with no game logic.
**Tasks:** `/client /server /shared` structure; TS strict; ESLint+Prettier single config; Vitest/Jest set up; `package.json` in each package + root (dev/build/test/lint); README stubs.
**Don't miss:** `/shared` builds and is imported by both packages; `rules.config.ts` is set up (even if partial).
**Done when:** `install` + `dev` in client and server start with no errors; `test` and `lint` pass on the empty skeleton.

### Phase 2 — Domain logic (`GameEngine`) + tests
**Goal:** all rules, isolated and deterministic, with no transport or client.
**Tasks:** the state machine (6.1); rules 5.x; pure bid validation/comparison functions with aces conversion (5.4) in `/shared`; injected RNG (6.4); meaningful tests, including **all conversion worked examples (5.4)**, special round, loser determination, timeout + double-loss protection (5.7), match win.
**Don't miss:** the engine imports no transport; the RNG is not called directly; the "phase × intents" table; the sixes rule and the dependence on bid history.
**Done when:** `GameEngine` is covered by tests on the key rules, runs from a test with no server; tests are deterministic and green; the 5.4 worked examples pass.

### Phase 3 — Transport + client, basic playability
**Goal:** a playable (unpolished) networked prototype.
**Tasks:** `@WebSocketGateway` over `GameEngine`; in-memory rooms with serialized mutations; filtered snapshots (6.6); Angular 21 + Ionic 9 + Tailwind client (Signals store, service layer over Socket.io); screens — entry/lobby/ready, table (basic layout), bid with hints and client pre-validation (5.8), reveal/round result, winner; a basic shake gesture → intent.
**Don't miss:** other players' dice do not reach the client before reveal (4.5); components do not touch Socket.io directly; client pre-validation uses the same function from `/shared`; the error contract (4.2).
**Done when:** two browser clients can play a full match from lobby to winner.

### Phase 4 — UI/UX polish and graphics
**Goal:** integrate the final 2D graphics and refine the layout.
**Tasks:** integrate Scenario assets via the dice config; finalize the table layout, UI frames, icons, the Tailwind theme from the Figma tokens.
**Don't miss:** visuals come from the config, dice rendering is swappable (3.5).
**Done when:** the interface matches the pirate theme; swapping assets/theme requires no changes to component logic.

### Phase 5 — Reconnect, timers, bank, edge-cases
**Goal:** robustness and full timings.
**Tasks:** session token and return-to-slot; server-authoritative timers (6.5) with the 15/25/bank-30 phases and the "yellow zone" sound; the timeout action + double-loss protection (5.7); the special-round bonus timer; unified disconnect/stall handling with no voting (section 7).
**Don't miss:** the bank is not spent automatically on disconnect; timers are server-side; races are eliminated by serialization; double loss is blocked only for a pure stall.
**Done when:** a test disconnect/silence scenario correctly leads to a die loss and blocks it on the second stall in a row; return-by-token works.

### Phase 6 — Documentation and deploy preparation
**Goal:** the project can be brought up from scratch by instructions with no extra questions.
**Tasks:** a README in each package + root (section 11); describe npm scripts by meaning; a deploy-instruction stub.
**Don't miss:** the deploy provider is not chosen (section 12) — leave a clear placeholder for the instruction, do not invent a host.
**Done when:** someone unfamiliar with the project brings it up locally using the README alone.

---

## 10. WHAT'S IN / OUT OF THE MVP

**In:** rooms/lobby/ready/start; the starting round; the full round cycle; bid validation with aces conversion (incl. the sixes rule); bid hints and client pre-validation; special round; 15/25 timers + a 30-sec bank with sound; unified disconnect/stall handling with no voting + double-loss protection; the win condition and a results screen; a configurable dice structure (2D); the shake gesture; web+Android+iOS from one codebase; Scenario graphics integrated; README documentation; an optional server-side timing override plus a per-room runtime timer toggle (3.4, `TIMING_CONFIG.md` — an extension added after the roadmap, not required for a match to be playable).

**Out:** OAuth; AI bots and LLM integrations; video/phone-tilt; poker-style stakes/chips; entertainment during the starting roll; an avatar pool / picture selection; deep visual polish/complex animations/sound (other than the timer signal); 3D dice models; disconnect voting; automated PR review / CI quality integration.

---

## 11. DOCUMENTATION AND RUNNING

- Each package (`/client`, `/server`, `/shared`) has its own `README.md`: prerequisites (Node.js version, package manager), install, local run (command, port/URL), running tests, **a meaningful description of every significant npm script**.
- The root `README.md` — an overview + "how to bring the whole thing up locally".
- Deploy — once the host is chosen (section 12), added with the same step-by-step pattern.

---

## 12. OPEN QUESTIONS (only the user closes these)

- Test hosting provider/method — not chosen yet (a virtual host for testing is planned).
- Confirm the default **[DEFAULT — confirm]**: minimum first bid = quantity 1.

*(Previously open items are closed: timers 15/25/bank-30 with sound; timeout = lose a die + double-loss protection for a pure stall; voting removed; RNG = crypto; the aces-conversion formula with the conditional sixes rule.)*

---

## 13. FUTURE IDEAS (not for the MVP — but accounted for structurally, 3.5)

- A dev-only "fixture mode" that loads a `StateSnapshot` straight into `GameStore`, bypassing
  Socket.io, to render any screen for design QA without playing a full match — planned, not
  built; see `STATE_FIXTURES_AND_SAVE_PLAN.md` and the matching `ISSUES.md` entry. Also logged
  there, but explicitly **not** the same risk level: true game save/restore across a **server**
  restart, which would reverse §3.3's "no DB" decision and needs the user's sign-off first.
- An avatar pool; at large volume (100+) — a modular (layered) system instead of hundreds of unique illustrations.
- AI bots with different "personalities"/models (plugged in as another intent source — the core is ready for it).
- Camera/phone-tilt interaction.
- Full stakes/chips.
- 3D dice models + a drop animation: either a pseudo-3D CSS trick on 2D sprites or a move to Three.js/Babylon.
