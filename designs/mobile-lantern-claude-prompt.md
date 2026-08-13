# Claude implementation prompt - Perudo mobile bid screen, lantern layout

Use this file as the first context message for Claude Code. After Claude reads it, run one step at a time by sending exactly `GO STEP 1`, `GO STEP 2`, and so on. Claude must stop after each step, report what it did, and wait for the next command. It must not continue into the next step automatically.

## Master context

We are updating the mobile user bid screen in this repository:

`D:\workspace\perudo`

The project is an Angular 21 standalone + Ionic 8.8 + Tailwind 4 client, a NestJS 11 + Socket.io server, and a shared TypeScript package. The server is authoritative. The client sends intents through `SocketService`, reads filtered state through `GameStore`, and must not invent game outcomes, randomness, or timers.

Read these files before changing code:

- `AGENTS.md` - project rules, phase status, architecture, game rules, and quality standards.
- `designs/mobile-lantern.dc.html` - the authoritative mobile bid-screen reference for this task. The current reference intentionally has only the round/dice phase chip in the header; it does not show a Ledger or bid-history control.
- `designs/perudo-design-kit.dc.html` and `designs/perudo-graphics-spec.dc.html` - existing visual language, tokens, and asset constraints.
- `designs/perudo-mobile-flow.dc.html` - wider mobile flow context, including the waiting state and the table handoff. Use it as context, but let `mobile-lantern.dc.html` win for this bid-screen decision.
- `designs/perudo-lobby-lantern.dc.html` and `designs/perudo-lobby-lantern-claude-prompt.md` - waiting-room reference and already-established entry/lobby decisions.
- `client/src/app/app.html` and `client/src/app/app.ts` - top-level screen switching.
- `client/src/app/features/table/table.ts`, `table.html`, `table.scss`, `table.spec.ts` - current board composition and the existing Ledger/history surfaces.
- `client/src/app/features/bid-controls/bid-controls.ts`, `bid-controls.html`, `bid-controls.scss`, `bid-controls.spec.ts` - authoritative client-side bid control wrapper and pre-validation.
- `client/src/app/ui/bid-picker/bid-picker.ts`, `bid-picker.html`, `bid-picker.scss` - quantity/face stepper presentation.
- `client/src/app/ui/bid-suggestion/bid-suggestion.ts`, `bid-suggestion.html`, `bid-suggestion.scss` - rule-required bid hints.
- `client/src/app/ui/bid-marker/*`, `client/src/app/ui/arc-seat/*`, `client/src/app/ui/die/*` - current bid token, opponent seats, and private dice rendering.
- `client/src/app/features/lobby/lobby.ts`, `lobby.html`, `lobby.scss`, `lobby.spec.ts` - waiting-room state that must not regress.
- `client/src/app/core/game-store.ts` and `client/src/app/core/socket.service.ts` - state and transport boundaries.
- `shared/src/types/state.types.ts`, `shared/src/types/round.types.ts`, `shared/src/game-engine.ts`, `shared/src/logic/bid-scale.ts`, and `shared/src/logic/player-view.ts` - the state/history contract, bid rules, and privacy filtering.
- `client/e2e/support.mjs`, `client/e2e/lobby-flow.e2e.mjs`, and `client/e2e/render-states.mjs` - existing browser-test helpers and the real entry/waiting-room flow.
- Root, client, server, and shared `package.json` files - available scripts.

Run `git status --short` first. The worktree already contains user changes in the entry, lobby, table, theme, design, and E2E files. Preserve unrelated changes. Never use `git reset --hard`, `git checkout --`, or broad destructive commands.

## Product outcome

Implement the mobile bid screen shown by `designs/mobile-lantern.dc.html`:

1. The board remains a dark, lantern-lit cabin surface.
2. The header keeps the round/total-dice phase chip. Do not show a Ledger chip, bid-history button, or history modal.
3. Opponent seats stay in the compact arc. The active bidder remains visually clear with the existing current-bidder treatment.
4. The latest public claim remains visible as one centered wager token. Removing history means removing the list of earlier bids, not removing the current claim or the data needed to validate it.
5. The local player's own dice remain visible as private 52px dice in the lower table area, regardless of whose turn it is.
6. On the local player's turn, the bottom bid tray contains the quantity/face picker and the `Place bid` / `Call liar` actions. It is a fixed, safe-area-aware mobile tray and must not create page-wide horizontal overflow.
7. When it is not the local player's turn, the tray becomes the existing compact waiting status, naming the current bidder and who answers next.
8. The flow from entry -> waiting room -> all-ready transition -> opening roll -> private hand roll -> bidding must keep working.

## Important scope decisions

### Remove the bid-history UI, not the bid-history state

The user-facing Ledger/history surfaces are explicitly removed from the mobile bid screen:

- no `Ledger` header chip;
- no Ledger/history `ion-modal`;
- no hidden or visible `.table__bid-history` list in the table rail;
- no dead ledger CSS or open/close signal left behind;
- no replacement history drawer, popover, tooltip, or debug list.

Do not delete or weaken `round.bidHistory` in `/shared` or the server. It is still required for:

- legal bid validation and aces conversion;
- `BidControls` context and `Call liar` availability;
- the latest public wager token;
- the reveal outcome and current-bid presentation;
- the server-authoritative game rules.

This is a presentation change only. Do not change `GameEngine`, the Socket.io event contract, dice privacy, or bid legality to make the history disappear.

### Do not conflate history removal with hint removal

The current `mobile-lantern.dc.html` reference is intentionally visually quiet in the lower tray and does not show a Ledger or history list. The project rules in `AGENTS.md` 5.8 still require the minimum legal bid and ace/normal switch hints to remain available. Do not silently delete `BidSuggestion` behavior just because the history was removed. In Step 1, identify the visual difference between the reference and the current hint row; preserve the rule-required hint behavior unless a separate product decision is explicitly provided. Keep hints compact and prevent them from causing horizontal page overflow.

### Waiting room is part of the acceptance flow, not a redesign target here

The waiting room was already reworked around `designs/perudo-lobby-lantern.dc.html`. Do not replace its transport or readiness protocol. Re-check it because the bid-screen change touches the same top-level flow:

- `app.html` renders `Lobby` while the shared phase is `LOBBY`.
- All players ready still transitions through the existing server state machine to `START_ROLL`.
- Opening-roll and hand-roll screens must still appear before `BIDDING`.
- The waiting-room room code, host marker, `(you)` marker, ready state, open seats, and all-ready behavior must remain intact.
- Do not add a second acceptance protocol, host authority, lobby discovery API, persistence, reconnect work, or timers in this task.

## Visual comparison: current implementation versus the target

Use the following as a concrete QA checklist. The static mockup is a visual reference, not permission to hardcode its sample names or counts.

### Header

Target: a single left-aligned rounded phase chip such as `Round 1 · 18 dice` on the dark cabin surface.

Current implementation: `table.html` renders the phase chip plus a `Ledger` button and `table.ts` owns `isLedgerOpen`, `openLedger`, and `closeLedger` for the modal.

Required change: remove the Ledger control and its modal route completely. Keep the live phase label data-driven from `MatchState` and the current player count/dice count.

### Opponent arc and current wager

Target: compact opponent seats arc across the upper mat; the active bidder has a stronger brass/lantern treatment; eliminated seats are subdued; the current public claim is a cream/parchment token with a die face and a short caption.

Current implementation: `Table` already uses `ArcSeat`, `currentBidderId`, `latestBidRecord`, and `BidMarker`; it also has a 9-12-player stress layout. Preserve this structure. Do not hardcode the mockup's `Anne`, `Mateo`, `Tobias`, `Grace`, `4`, or face `5`.

Required change: keep the latest wager token and the public current-bid context after history removal. Earlier bids must not appear anywhere in the mobile DOM.

### Local hand

Target: five large, readable 52px dice sit in one strip above the lower tray and remain stable while the turn changes.

Current implementation: `table.html` renders `.mobile-hand-strip` from the filtered local `Player.dice`, and `Table` uses the private player view.

Required change: do not move private dice into the history area or reveal another player's dice. Confirm that the filtered snapshot still blanks opponents' dice before reveal.

### Bid tray

Target: dark rounded-top tray attached to the bottom edge; two vertical steppers separated by `×`; a quantity number and a real die face; strong terracotta `Place bid`; outlined ember `Call liar`; safe-area padding; no competing second tray.

Current implementation: `Table` renders exactly one `app-bid-controls` and uses `.mobile-bid-sheet` to position it; `BidControls` owns the signal state and sends intents through `SocketService`; `BidPicker` is presentational.

Required change: refine only what is needed to match the reference. Keep the server-authoritative submit path, client pre-check, special-round face lock, disabled states, focus behavior, and the existing waiting bar. Do not move Socket.io calls into `BidPicker` or into a template-only workaround.

### Surfaces that must disappear

The current code has all of the following and the target does not:

- `.table-mobile-header__chip--ledger` and its `Ledger` text;
- `.table-ledger-modal` and its `ion-modal` content;
- `.table__bid-history` and its `Bid history` heading/list;
- `.table-ledger-*` styles;
- `isLedgerOpen`, `openLedger`, and `closeLedger` in `Table`.

Remove those surfaces cleanly. Do not remove `latestBidRecord`, `bidHistory` from the shared state, or `BidControls`' context computation.

## Flow and component re-check

Before editing, draw this actual flow and use it as the regression boundary:

```text
Entry
  -> SocketService.joinRoom
  -> Lobby / waiting room
  -> all joined players ready
  -> START_ROLL / opening-roll UI
  -> ROUND_ROLLING / each player rolls their own hidden hand
  -> BIDDING
       -> one current bidder sees the interactive mobile tray
       -> every other player sees the waiting status bar
       -> place bid updates the latest wager and moves the turn
       -> call liar opens the existing reveal flow
```

Re-check these component boundaries after the change:

- `app.html` remains the only top-level screen switch.
- `Table` remains the composition owner for the board and renders one `BidControls` instance.
- `BidControls` remains the owner of local quantity/face signals and the only feature component that sends bid/call intents.
- `BidPicker` remains presentational and emits values only.
- `BidSuggestion` remains the shared hint presentation unless Step 1 documents a separate decision.
- `GameStore` remains the state source; components do not receive hidden opponent dice.
- `SocketService` remains the only Socket.io boundary.
- `Lobby` remains the waiting-room owner; its ready toggle still calls `setReady`.
- `RoundLossModal` and reveal UI still receive the existing reveal events.

## Required states

Cover these states in focused tests and browser/render checks where applicable:

- `LOBBY`: host only, then host plus guest, mixed ready/not-ready, guest perspective, and all-ready transition;
- `START_ROLL`: opening-roll controls and public opening dice still render;
- `ROUND_ROLLING`: local hand-roll button still works and no stale bidding badge appears;
- `BIDDING`, local turn, no prior bid: picker/actions are active, `Call liar` is unavailable;
- `BIDDING`, local turn, prior bid: latest wager is visible, legal controls are active, `Call liar` is available;
- `BIDDING`, another player's turn: compact waiting status names the current bidder and next responder;
- `BIDDING`, special round: face lock and declaration behavior remain intact;
- post-bid state: current wager updates, but there is no bid-history list or Ledger control;
- reveal: existing reveal panel/modal still works and dice privacy changes only after the server reveal event;
- 2-8 players and the 9-12-player stress layout;
- 320px/390px portrait and a reasonable desktop viewport with no accidental horizontal overflow.

## Non-negotiable quality rules

- Keep strict TypeScript, standalone Angular components, Signals, Ionic, Tailwind, and the existing root ESLint/Prettier setup.
- Keep functions small and explicit. Do not use `any` without the written project-required justification.
- Keep all server authority, RNG, timer, and bid-rule logic unchanged.
- Do not add a database, new backend endpoint, new room protocol, bot, avatar system, 3D dice, or generated raster art.
- Use existing theme tokens and mixins instead of scattering new raw colors through component SCSS.
- Keep touch targets at least 44px and preserve keyboard focus-visible states.
- Do not use color as the only signal for current bidder, ready state, disabled state, or reveal outcome.
- Do not claim a visual result until the real application has been rendered and inspected.
- At the end of each step, report changed files, checks run, failures, and the exact next command. Then stop.

## Step commands

### GO STEP 1 - audit only, no edits

Read the referenced files and inspect the current worktree. Produce:

1. a concise current-flow diagram from Entry through Lobby, START_ROLL, ROUND_ROLLING, and BIDDING;
2. a component/data-flow diagram showing `GameStore -> Table -> BidControls/BidPicker`;
3. a file-by-file implementation plan for removing the Ledger/history UI;
4. a precise list of history UI references that can be deleted versus `bidHistory` references that must stay;
5. a visual delta list against `designs/mobile-lantern.dc.html`, including the hint-row discrepancy;
6. a unit/E2E/render test matrix;
7. the waiting-room regression points that must be checked before declaring this task complete.

Run only safe read-only checks. Do not edit files. Stop.

### GO STEP 2 - remove the user-facing Ledger/history surfaces

Implement only the explicit history removal:

- remove the Ledger header control from `table.html`;
- remove the history modal and its contents;
- remove the hidden `.table__bid-history` markup instead of leaving a visually hidden debug list;
- remove the now-unused Ledger signal, methods, imports, styles, and comments;
- keep latest current-bid presentation, bid validation context, `Call liar`, reveal behavior, and `round.bidHistory` intact;
- update `table.spec.ts` to assert the current wager still renders and the Ledger/history surfaces do not;
- do not modify the waiting-room protocol or server/shared rules.

Run the focused Table and BidControls tests, then client typecheck, lint, format check, and build. Stop and report exact results.

### GO STEP 3 - align the mobile bid tray with the lantern reference

Compare the live 390x844 screen with `designs/mobile-lantern.dc.html` and fix only the visual/interaction differences that are in scope:

- preserve the full dark lantern surface and phone-frame/safe-area behavior;
- keep the single phase chip aligned as in the updated reference;
- keep the opponent arc, active bidder emphasis, current wager token, and local 52px dice strip;
- keep exactly one fixed mobile bid tray on the active player's turn;
- keep the compact waiting bar on non-active turns;
- preserve legal min/switch hints required by `AGENTS.md` 5.8, but make them compact and non-blocking if they remain outside the static reference;
- preserve 44px touch targets, keyboard focus, disabled states, and no page-wide horizontal overflow;
- keep `Place bid` primary and `Call liar` as the outlined danger action;
- keep special-round face locking and invalid-bid feedback;
- do not reintroduce a history drawer under another name.

Update focused component tests for any changed DOM or behavior. Run client tests, typecheck, lint, format check, and build. Stop.

### GO STEP 4 - re-check the waiting room and full handoff flow

Do not redesign the waiting room. Exercise and inspect the real flow:

1. host enters a nickname and creates a room;
2. guest enters a nickname, uses the join-code step, and joins the same room;
3. both land on the existing lantern waiting room;
4. host becomes ready while guest remains not ready;
5. both clients reflect the mixed ready state and remain in `LOBBY`;
6. guest becomes ready and both clients leave the lobby through `START_ROLL`;
7. both players complete the opening roll;
8. both players complete their private hand roll;
9. both clients reach `BIDDING`, with exactly one active bid tray and one waiting status;
10. the active player places one legal bid and the other player sees the updated current wager;
11. the next player calls liar and the existing reveal flow appears.

Check that the mobile bid-screen change did not break room code, `(you)`, host, ready state, filtered dice, phase transitions, or reveal. Fix only regressions in this task's scope. Stop.

### GO STEP 5 - automatic sanity checks and browser E2E

Use the existing plain Playwright setup and helpers. Do not replace the current unit-test setup and do not introduce a second browser-test framework unless there is a compelling repository-level reason.

Add or extend a maintainable E2E script so two isolated browser contexts drive the real local client/server. The test must:

1. preserve the existing create/join/waiting-room checks;
2. verify one ready plus one not-ready does not start the match;
3. verify the final ready action reaches opening roll;
4. click both opening-roll controls and both private hand-roll controls;
5. wait for `BIDDING` and identify which context is the active bidder from the rendered UI, rather than assuming host order;
6. assert that neither context has a Ledger button, history modal, `Bid history` heading, or `.table__bid-history` node;
7. assert that the current wager is visible after one legal bid and that the other context shows the waiting state;
8. call liar from the next active context and verify the existing reveal UI appears;
9. capture page errors and console errors as failures, not as ignored noise;
10. assert no page-wide horizontal overflow at 390x844.

Run the full automatic checks from the repository root:

```text
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run e2e
```

If an existing command is flaky because the local server is already running, diagnose the process/port situation and rerun safely. Do not weaken assertions or hide failures. Stop with exact commands and results.

### GO STEP 6 - render and inspect the actual UI

Use `npm run e2e:render` or a focused Playwright render script against the real app, not only the static HTML. Capture at least:

- `waiting-host-only.png`;
- `opening-roll-after-all-ready.png`;
- `bidding-active-no-history.png`;
- `bidding-waiting-no-history.png`;
- `reveal-after-call-liar.png`;
- one 1440px-wide representative screen.

Inspect the screenshots against `designs/mobile-lantern.dc.html`. Specifically check:

- no pale outer ring around the dark cabin surface;
- no Ledger text, history list, or modal trigger anywhere in the bid screen;
- one phase chip, not two competing header controls;
- active seat and current wager remain readable;
- own five dice remain large and visible above the tray;
- tray buttons do not clip, overlap, or become unreachable behind safe-area padding;
- the waiting bar does not look like an active bid tray;
- no hidden opponent dice leak before reveal;
- no accidental horizontal scroll at 320px or 390px;
- hint controls, if present, remain legible and do not push the primary actions below the viewport.

Fix visual defects within scope and rerun the render check. Do not claim visual completion without inspecting the screenshots. Stop.

### GO STEP 7 - final audit and handoff

Review the diff and confirm:

- only the mobile bid-screen/history-removal scope was changed;
- `round.bidHistory` and all authoritative bid validation/reveal logic remain intact;
- no Ledger/history UI or dead ledger CSS remains in the mobile board;
- the current public wager still renders;
- exactly one `BidControls` instance remains in the Table composition;
- waiting room, opening roll, hand roll, bidding, and reveal transitions still work;
- private dice filtering is unchanged;
- no raw design-token sprawl or generated art was introduced;
- unit tests, E2E, typecheck, lint, format check, and build are green;
- rendered screenshots exist or their generation is reproducible.

Report the final changed-file list, all commands/results, screenshot paths, any unresolved visual delta (especially the rule-required hint row), and whether the work is ready for review. Do not mark the task complete if a required check is still failing.
