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
- [ ] Phase 4 — UI/UX polish and graphics integration. **In progress — structural half only, at the user's explicit request to proceed without real art.** Still open, not closed by me: real Scenario 2D assets and Figma tokens (8.1 — "the agent does not generate assets"; `scenario-prompt-brief.md` that held the ready-made prompts was also deleted from the repo at some point, outside this work). Done so far: `DICE_FACES_CONFIG` in `/shared` (value, label, isAce, usesSkull, optional `imageUrl` — currently always unset) so dice rendering is genuinely config-driven (3.5, 8.2); client `Die` component renders CSS pips (skull emoji placeholder on six) and falls back to `<img [src]="imageUrl">` automatically the moment a face gets a real image — zero component changes needed later, which is the actual "Don't miss" requirement, independent of whether the art exists yet. `SeatCard` + an adaptive oval/arc `Table` layout for 2–12 players (8.3: my seat fixed bottom-center and larger; others spread left-to-right across the top arc via a sine-curve approximation of the ellipse; card size steps down as the table fills, then the row switches to horizontal scroll past ~7 opponents instead of shrinking below legibility). Placeholder "pirate" Tailwind theme tokens (parchment/wood/gold/sea/ink — real values swap in from Figma later) plus matching Ionic CSS-variable overrides; a few ionicons already in the stack (dice, skull, checkmark, person-circle) wired into the roll/call-liar/ready buttons. Verified with an 8-player live-browser Playwright run — arc layout, per-seat sizing, own-dice pip legibility (needed a real fix: padding math was collapsing pips to sub-pixel at the original 22–28px card width — my own seat is now sized to its content instead of the shared opponent-card width tier), and dice privacy all held up, no console errors. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all clean repo-wide. Remaining for this phase: swap in real assets/tokens once available (by design, should need no component changes) — until then the interface does not yet "match the pirate theme" per the phase's own done-when criterion, so this stays unchecked.
- [ ] Phase 5 — Reconnect, timers, time bank, edge-cases
- [ ] Phase 6 — Final documentation and deploy preparation

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

**In:** rooms/lobby/ready/start; the starting round; the full round cycle; bid validation with aces conversion (incl. the sixes rule); bid hints and client pre-validation; special round; 15/25 timers + a 30-sec bank with sound; unified disconnect/stall handling with no voting + double-loss protection; the win condition and a results screen; a configurable dice structure (2D); the shake gesture; web+Android+iOS from one codebase; Scenario graphics integrated; README documentation.

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

- An avatar pool; at large volume (100+) — a modular (layered) system instead of hundreds of unique illustrations.
- AI bots with different "personalities"/models (plugged in as another intent source — the core is ready for it).
- Camera/phone-tilt interaction.
- Full stakes/chips.
- 3D dice models + a drop animation: either a pseudo-3D CSS trick on 2D sprites or a move to Three.js/Babylon.
