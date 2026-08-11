# Claude prompt: mobile board layout migration

Read `CLAUDE.md` / `AGENTS.md` in full before editing. Treat `designs/perudo-mobile-board.dc.html` as the authoritative mobile-table reference.

You are working in the Perudo Angular/Ionic client. The current mobile game table is a vertically stacked desktop layout. Gradually transform it into the reference's mobile board: dark cabin surface, compact header chips, opponent seats around a top arc/mat, one private local-player zone at the bottom, on-demand ledger, and a bid sheet that appears only on the local player's turn.

Do this as a layout/presentation change only. Do not change game rules, shared state/types, engine behavior, gateway behavior, Socket.IO events, or server code. Keep `SocketService` as the only client Socket.IO boundary. Keep all current functionality working: opening roll, hand roll, bid validation and hints, special-round declaration, call liar, reveal, round-loss modal, and winner flow. Do not overwrite or revert unrelated working-tree changes.

Important visual/functional guardrails:

- Use existing assets under `client/public/assets/` and existing theme tokens. Do not generate or add bitmap art.
- Preserve dice privacy: only the local player can see their dice before reveal.
- Do not add real avatars. The reference's identity tile should use a deterministic decorative mark or initial based on player id/nickname.
- Keep desktop/tablet layout behavior intact; use mobile-specific presentation/components/styles where necessary.
- Mobile target: 390 x 844, including iOS/Android safe-area handling. Also check 320px and 430px portrait widths.
- No horizontal page scroll. Controls need at least 44px touch targets; primary and destructive actions are 56px high.
- Never show raw state-machine labels such as `ROUND_ROLLING` to players.
- Work in the phases below, in order. Finish and verify one phase before beginning the next. Commit only files belonging to the completed phase.

## Phase 1 - board shell and hierarchy

At widths below 768px:

1. Make the table screen viewport-oriented with safe-area-aware top/bottom padding and the existing mobile table background.
2. Replace `Round N - PHASE` with two compact 36px header chips:
   - a plain-language phase label (`Before round 1`, `Round 5 - 19 dice`, `Your turn`);
   - a `Ledger` trigger.
3. Move bid history into an accessible, dismissible Ionic modal/popover/bottom sheet opened by the Ledger trigger. It is closed by default.
4. Establish a central oval/mat region and a stable bottom region for local dice and the current action.

Do not redesign the bid controls yet. Keep all existing bindings/actions working.

Acceptance: at 390 x 844, header, mat, and bottom region fit naturally; bid history is reachable but does not permanently occupy the board; no debug heading remains.

## Phase 2 - compact opponent arc seats

Implement a mobile-only seat presentation; desktop/tablet may retain the existing `SeatCard`.

1. Replace mobile opponent cards with compact arc seats: 54 x 54 rounded identity tile, nickname, and compact state slot.
2. Active player must be distinguishable without color alone: 3px brass ring plus heavier/larger name. Do not use the Ionic `Bidding` badge on mobile.
3. Hand-roll state should be small and local to each seat (`rolled`, waiting, eliminated); no large status badges/global progress bar.
4. During opening rolls, reserve a 40px dashed die slot per seat; replace it in place with the public die. Highlight the opening winner with a 44px die plus brass ring. Keep tie messaging in a caption/status slot, never over the mat.
5. Do not render the local player as another large seat card on mobile; local private dice/cup live in the bottom region.
6. Retain data-driven positions and add mobile-only position helpers if needed.

Acceptance: 2-8 players read as a single upper arc; no overlapping/clipped seats; active turn and roll status are apparent at a glance.

## Phase 3 - private hand zone

Implement the bottom local-player presentation across opening roll, hand roll, and after-roll states.

1. Opening roll: show the local public die bare, a full-gutter 56px primary roll button, and concise `Shake or tap` copy.
2. Hand roll: center the existing top-down cup at 236px. Its roll button must be exactly 236px wide and 56px high. Keep server-triggered roll behavior unchanged; shake/rattle/blur effects are cosmetic only.
3. After a local hand roll, show a private bottom hand strip beneath the mat. It is obscured while waiting and may become sharp while the local bid sheet is open. It must never expose other players' dice.
4. Remove duplicate local seat/card UI only on mobile.

Acceptance: each phase has one unambiguous local action/status region; cup/dice never overlap or push into the opponent arc.

## Phase 4 - bid sheet and waiting state

Recompose existing `BidControls`; do not rewrite shared bid-validation logic.

1. On the local player's turn in `BIDDING`, show a bottom sheet above the hand strip with the current claim token, quantity/face picker, horizontally scrollable suggestions, special-round action when legal, and actions.
2. `Place wager` is the only filled primary action. `Call liar` is the only outlined destructive action. Both stay 56px high and preserve existing validation/disabled behavior.
3. Use current pure local validation and current server submission paths unchanged.
4. When another player has the turn, replace the entire bid sheet with a 56px status bar such as `Anne weighs her wager`; do not show disabled controls.
5. Render the current bid as a prominent wager token on the mat beside the bidding player. Earlier bids collapse to subdued chips; full history remains in Ledger.

Acceptance: at 390 x 844, a local player can complete a legal bid or call liar without scrolling; waiting view has no disabled bid controls; existing bid-control tests pass.

## Phase 5 - 9-12 players and reveal

1. For 9-12 players, render two arcs of at most six: inset/slightly subdued back arc plus front arc. Use 58px seat widths, 42px identity tiles, and ellipsized names. Do not use horizontal scrolling for this mobile stress case.
2. Keep eliminated seats in place at reduced opacity so the board never reflows during a match.
3. At 12 players, move the active wager token to the mat centerline and reduce it one size step.
4. Keep existing reveal/round-loss event data, but present the reveal in the board context with clear claimed-vs-actual and loss information.

Acceptance: all 12 seats are identifiable at 390px wide; no clipped labels/overlapping controls/horizontal page scroll; privacy remains intact before reveal.

## Required verification after each phase

Run:

```powershell
npm run lint
npm run typecheck
npm run test -w client
```

Also manually test at 390 x 844: opening roll, hand roll, local bidding, waiting-for-opponent state, call-liar reveal, and 12-player layout. Check 320px, 390px, 430px portrait plus a desktop regression.

At the end of each phase, report the files changed, tests run, and any design details still blocked by missing assets or product decisions. Do not start the next phase if the current phase does not meet its acceptance criteria.
