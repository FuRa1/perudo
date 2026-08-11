# Task: progressively align the mobile table with `perudo-mobile-board`

## Role and goal

You are updating the Angular/Ionic client of this Perudo project. Bring the mobile game-table layout into close alignment with the authoritative design reference at `designs/perudo-mobile-board.dc.html` without changing the game rules, Socket.IO contract, state shape, or server logic.

The current mobile table is a vertically stacked desktop layout: a debug-like phase heading, card-based seats, a separate local-player card, and always-visible bid/ledger content. The reference is a single board: a dark cabin background, opponents arranged around an upper mat/arc, the player's private dice at the bottom, one compact header, and turn-specific controls that occupy a bottom sheet only when needed.

Work in the increments below, in order. Each increment must leave the client usable, responsive from 320px through 430px wide, and free of horizontal page scrolling. Do not start a later increment until the preceding one is complete and verified.

## Authoritative sources

- Mobile visual and interaction reference: `designs/perudo-mobile-board.dc.html`
- Existing component boundaries: `client/src/app/features/table/`, `client/src/app/ui/seat-card/`, `client/src/app/features/bid-controls/`, `client/src/app/ui/dice-cup/`
- Existing assets and tokens: `client/public/assets/`, `client/src/theme/`
- Project rules and constraints: `AGENTS.md`, especially sections 3.2, 4, 6.6, and 8.

Use the design’s five mobile states as acceptance references:

1. Opening roll
2. Hand roll
3. Bidding — local player’s turn
4. Bidding — waiting for another player
5. Twelve-player stress case

## Non-negotiable constraints

- Keep server state authoritative and keep other players’ dice private before reveal.
- Do not alter shared domain logic, gateway behavior, or transport events for a visual/layout task.
- Keep `SocketService` as the only client file that talks to Socket.IO.
- Preserve current functional behavior: opening rolls, private hand rolls, bid hints/validation, special-round declaration, reveal, round-loss modal, and winner flow.
- Do not introduce real avatar selection. The reference’s avatar tile can use a deterministic decorative mark/initial based on a player id or nickname; `Player.avatarUrl` remains optional and unused.
- Reuse the existing dice/cup/background assets and theme tokens. Do not generate new bitmap assets.
- Keep the desktop/tablet composition intact unless a shared component change is demonstrably responsive and visually compatible.
- All controls must have a minimum 44px touch target; primary and destructive actions are 56px tall on mobile.
- Never expose raw engine enum text (for example, `ROUND_ROLLING`) as a user-facing heading.

## Increment 1 — mobile board shell and information hierarchy

Implement only the board frame and header; do not redesign bidding controls yet.

- At mobile widths (below 768px), make the table screen fill the available viewport height with safe-area-aware top/bottom padding and the existing mobile table background.
- Replace the raw `Round N — PHASE` heading with two 36px header chips:
  - left: plain-language phase context such as `Before round 1`, `Round 5 · 19 dice`, or `Your turn`;
  - right: a `Ledger` button/trigger.
- Move bid history behind the Ledger trigger using an Ionic modal, popover, or accessible bottom sheet. It must remain readable and dismissible, but it must not permanently consume board space.
- Establish a central oval/mat region below the header and a stable bottom region reserved for the local player’s dice/hand and current action.
- Keep all existing data bindings and functional roll/bid actions intact.

**Acceptance:** at 390 × 844, the header, mat, and bottom region are visible without the debug heading; the ledger is reachable but closed by default; no functionality regresses.

## Increment 2 — replace card rows with compact arc seats

Implement the mobile-only opponent presentation. The existing desktop `SeatCard` may remain for desktop/tablet, but avoid duplicating game logic.

- Replace the mobile opponent cards with compact arc seats: 54 × 54 rounded identity tile, nickname beneath, and a small state slot beneath/adjacent to the name.
- The active player is communicated without relying on color alone: 3px brass ring plus a heavier/larger name. Do not show an Ionic `Bidding` badge.
- Hand-roll state is a compact per-seat status only (`✓ rolled`, waiting, or eliminated); do not use large status badges or a global progress bar.
- Opening-roll slots reserve their layout space: show a 40px dashed placeholder until a public die arrives, then replace it in place. Highlight the winner with a 44px die and brass ring. Tie copy belongs in the caption/status area, not on the mat.
- The local player is not rendered as another large card. Their private dice/cup belong in the dedicated bottom region.
- Preserve the current data-derived opponent positions, but create mobile-specific positioning/layout helpers if necessary.

**Acceptance:** a 2–8 player match reads as one upper arc around the mat; the active player and roll progress are legible at a glance; no seat overlaps or clips.

## Increment 3 — private hand-roll and bottom hand strip

Implement the local player area for opening roll, hand roll, and post-roll states.

- Opening roll: show the local public die bare (not inside a cup), a full-gutter 56px primary roll button, and concise `Shake or tap` supporting copy.
- Hand roll: center the existing open top-down cup at 236px. Its matching roll button is exactly 236px wide and 56px tall. Keep the existing real server-triggered roll behavior; any shake/rattle/blur is cosmetic only.
- After the local hand is rolled, show the player’s private dice as a bottom `hand strip` beneath the mat. It is visually obscured while waiting and may become sharp during the local bid sheet, but it must never reveal anyone else’s dice.
- Remove duplicate local seat/card presentation from mobile only.

**Acceptance:** every phase has one clear local action or status region; the cup/dice presentation never displaces or overlaps the opponent arc.

## Increment 4 — bidding as a turn-specific bottom sheet

Recompose existing bid controls; do not rewrite bid-validation logic.

- When it is the local player’s turn in `BIDDING`, render the bid controls in a bottom sheet above the hand strip. It includes the current claim/board token, quantity/face picker, horizontally scrollable suggestion pills, special-round action when allowed, and the two actions.
- Only `Place wager` is filled/primary. `Call liar` is the sole outlined destructive action. Both are 56px tall and retain the existing disabled/legality behavior.
- Use the existing pure client-side validation and server submission paths unchanged.
- On another player’s turn, do not show disabled bid controls. Replace the sheet with a 56px status bar such as `Anne weighs her wager` and preserve the board/hand strip.
- Render the current bid as a large wager token on the mat, adjacent to the player who placed it: quantity and die face must be legible at arm’s length. Earlier bids collapse into subdued chips; full history stays in the Ledger.

**Acceptance:** at 390 × 844, the local player can place a legal bid or call liar without scrolling; waiting players see no inactive controls; all current bid-control tests still pass.

## Increment 5 — high-player-count and reveal polish

- For 9–12 players, split the opponents into two arcs of up to six: an inset, slightly subdued back arc and a front arc. Use 58px seat width, 42px identity tiles, and ellipsized names. Do not rely on horizontal scrolling for this mobile case.
- Eliminated seats retain their reserved position at reduced opacity so the board does not reflow during a match.
- With 12 players, move the active wager token to the mat centerline and reduce it one size step.
- Make reveal/round-loss use the existing modal/event data but visually tie it to the board: claimed vs actual summary, revealed dice, and the loss result must be readable before continuing.

**Acceptance:** all 12 seats remain identifiable at 390px wide; no overlapping controls, clipped labels, or horizontal page scroll; reveal still respects private-dice behavior before the reveal event.

## Verification after every increment

1. Run `npm run lint`, `npm run typecheck`, and the relevant client tests.
2. Manually test one opening roll, one hand roll, local bidding, waiting-for-opponent state, call-liar reveal, and a 12-player layout at 390 × 844.
3. Check 320px, 390px, and 430px portrait widths, plus desktop regression.
4. Do not overwrite or revert unrelated working-tree changes.

## Done criteria

The mobile table visibly follows `perudo-mobile-board.dc.html`’s hierarchy: compact header chips, a true mat/arc board, compact stateful seats, one local hand zone, a ledger that is on demand, and a local-turn-only bid sheet. It remains a fully playable, server-authoritative Perudo match with clean lint, typecheck, and tests.
