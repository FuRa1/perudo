# Claude implementation prompt — Perudo entry flow and waiting room 2a

Use this as the first context message for Claude Code. After Claude reads it, run one step at a time by sending exactly `GO STEP 1`, `GO STEP 2`, and so on. Claude must stop after each step and wait for the next command.

## Master context

We are updating the Perudo lobby and waiting-room flow in this repository:

`D:\workspace\perudo`

This is an Angular 21 standalone + Ionic 8.8 + Tailwind 4 client, a NestJS 11 + Socket.io server, and a shared TypeScript package. The server is authoritative. The client sends intents through `SocketService`, reads state through `GameStore`, and must never invent game outcomes, randomness, or timers.

Read these files before changing code:

- `AGENTS.md` — project rules, phase status, architecture, testing standards, and open questions.
- `designs/perudo-lobby-lantern.dc.html` — the primary visual reference for entry screens `1a`/`1a2` and waiting room `2a`.
- `designs/perudo-design-kit.dc.html` and `designs/perudo-graphics-spec.dc.html` — visual language and existing assets/tokens.
- `client/src/app/app.html`, `client/src/app/app.ts` — top-level screen switching.
- `client/src/app/features/entry/entry.ts`, `entry.html`, `entry.scss`, `entry.spec.ts` — current entry screen.
- `client/src/app/features/lobby/lobby.ts`, `lobby.html`, `lobby.scss`, `lobby.spec.ts` — current waiting room.
- `client/src/app/core/game-store.ts` and `client/src/app/core/socket.service.ts` — state and transport boundaries.
- `shared/src/types/state.types.ts`, `shared/src/game-engine.ts`, and `server/src/game/game.gateway.ts` — room/player state and authoritative transitions.
- `package.json` files at the root, `client`, `server`, and `shared` — available checks and scripts.

The worktree may already contain user changes. Inspect `git status` first. Preserve unrelated work. Never use `git reset --hard`, `git checkout --`, or broad destructive commands.

## Product outcome

Implement this flow:

1. Initial page: the player types their nickname.
2. The initial page has two clear choices:
   - `Start a table` / create room.
   - `Join with a code` / join room.
3. Creating a room sends the existing authoritative join intent using a newly generated room code, then opens the waiting room.
4. Joining a room opens a separate room-code step. The player enters the invitation code and submits it. Keep the nickname while moving between the two entry steps.
5. After either path succeeds, every participant sees the same waiting-room screen (`2a`). The only intentional per-player differences are the `(you)` marker, the player’s own ready action, and any permission-safe host marker.
6. “Accept” in this waiting-room context means the existing `setReady` / ready toggle. Do not create a second acceptance protocol.
7. The match still starts through the existing server rule: at least the configured minimum number of players and every joined player ready. When the final required player becomes ready, the existing transition to `START_ROLL` must remain intact.

## Important contracts and decisions

### Room-code length

The mockup’s `1a2` screen visually shows six slots and says “six letters”, but the live repository currently has a five-character contract:

- `client/src/app/features/entry/entry.ts` uses `ROOM_CODE_LENGTH = 5`.
- `SocketService` and the server treat the room id as an opaque string.
- Existing tests and the current screenshot use five slots.

For this task, preserve five characters and make the visuals match the mockup’s segmented-control treatment. Do not silently change the product contract to six. If you believe six is required, stop and report the conflict instead of changing client, server, and tests implicitly.

### Host

The current shared `Player`/`MatchState` model does not have an explicit host field. The first successful player in a newly created in-memory room is effectively the creator because the first join creates the room.

Default for this UI task: treat the first player in stable seating order as the display-only host, show `Host` on that row for all clients, and do not add host-only gameplay authority or house-rule semantics. If an explicit `hostPlayerId` is necessary for correctness, make the smallest shared/server change, test it, and explain why it is needed. Do not invent a new host workflow.

The `House rules` element in the reference is not a request to implement a rules editor. Keep it as a quiet non-destructive affordance or omit it if making it interactive would require unsupported behavior. Never ship a fake button that claims to change rules.

### Player count

The mockup uses a static example such as `2 of 6`. The actual project rules allow 2–12 players. Use `RULES_CONFIG.players.min` and `RULES_CONFIG.players.max` for live text; do not hardcode six in application logic. The visual proportions should still follow the mockup.

### Existing architecture

- `app.html` currently chooses Entry until `store.playerId()` exists, Lobby while the phase is `LOBBY`, and the game board after that.
- Entry already connects the socket and calls `SocketService.joinRoom`.
- Lobby already renders server players, ready state, room code, and a ready toggle.
- `GameEngine` already owns the lobby transition and should remain the authority.
- Do not move Socket.io access into components, duplicate server rules in the client, add a database, add bots, or jump ahead to reconnect/timers.
- Do not generate new raster art. Use existing assets and CSS/token fallbacks.

## What differs from the reference and must be corrected

### Current entry versus `perudo-lobby-lantern.dc.html` `1a`

The current entry (`entry.html`) still shows nickname and the room-code OTP at the same time, followed by `Open a table` and `Join table`. That forces the player to reason about a field before choosing a path. The supplied screenshot shows the same problem: room-code boxes are visible before the player has chosen to join, and the filled button reads muted/disabled.

Reference `1a` makes the first screen one decision at a time:

- full dark lantern-lit surface, not a pale page surrounding a dark inset card;
- Perudo brand/hero and short tagline;
- nickname is the only input;
- primary pill `Start a table`;
- secondary outline pill `Join with a code`;
- connection state is a small status line at the bottom, not a blocking spinner in the form;
- strong terracotta primary contrast, cream outline secondary, brass focus treatment;
- the code entry belongs to `1a2`, not the first screen.

Reference `1a2` is the join step:

- back affordance and the retained nickname;
- heading `Room code` and short explanation;
- segmented code boxes with one active/focused slot;
- submit is disabled until the configured five characters are present;
- server errors remain visible and accessible;
- do not invent an “open tables” endpoint merely because one alternative mockup includes a list.

### Current lobby versus `perudo-lobby-lantern.dc.html` `2a`

The current lobby (`lobby.html`/`lobby.scss`) is a light surface with a dark header band, a small room-code chip, light player rows, no open seats, and a ready button at the bottom of a mostly empty card. The target `2a` is one coherent waiting room in the same lantern-lit world as the board:

- full dark cabin/lantern background with subtle radial light and plank texture;
- compact top bar with back affordance and quiet `House rules` label;
- title `The crew is gathering` and subtitle such as `Send this to whoever you want at the table.`;
- a cream/parchment, brass-edged room-code hero card;
- room code large enough to read aloud at approximately 36px in the reference;
- `Share invite` primary action plus adjacent `Copy` icon/action;
- share/copy feedback that is truthful and accessible;
- `At the table` label with live player count and ready count;
- dark roster rows, with the current player’s row using the brass identity treatment;
- host role visible as text, not color alone;
- ready/not-ready chips with text and distinct styling;
- dashed open-seat placeholders to turn empty space into useful information;
- prominent `I’m ready` / `Cancel ready` pill;
- helper text under the button: minimum player count and that the match starts when all are ready;
- no large empty void between roster and action;
- no light cream lobby card around the whole waiting room.

Use existing theme variables in `client/src/theme/_tokens.scss` and shared mixins. The reference palette is approximately cabin `#241d16`, warm center `#6a5335`, cream `#f6ecd8`, parchment dark `#e4d5b8`, brass `#d69a52`, terracotta `#c67139`, deep terracotta/brass `#8c491a`, ivory `#fffaf0`, muted cream `#a19786`, and sage `#7a8a5e`. Map these to tokens; do not scatter raw hex values through component styles.

## Required behavior states

Cover all of these, both visually and in tests where applicable:

- initial entry with no nickname;
- initial entry with nickname typed and both choices visible;
- join step with partial code, focused slot, and disabled submit;
- join step with a complete five-character code and enabled submit;
- invalid room/join error without losing the nickname or code;
- waiting room with host only;
- waiting room with host plus guest, both not ready;
- waiting room with host ready and guest not ready (`1 ready`, no match start);
- waiting room from the guest’s perspective, with the guest’s own row marked `(you)`;
- waiting room with three or more players and mixed ready/not-ready states;
- open-seat placeholders while the room is below the maximum;
- all required players ready, followed by the existing transition to `START_ROLL`/opening-roll UI;
- truthful copy success/failure;
- truthful share success, unavailable-share fallback, or failure without claiming that a share happened;
- responsive rendering at a 390×844 mobile viewport and a reasonable desktop viewport.

## Non-negotiable quality rules

- Keep the server authoritative and preserve the existing intent/event/state architecture.
- Keep the client’s Socket.io boundary in `SocketService`.
- Use Signals and the existing standalone Angular/Ionic style.
- Use semantic headings, labels, buttons, live regions, keyboard focus states, and at least 44px touch targets.
- Do not use color as the only ready/host signal.
- Preserve the existing five-character room-code contract.
- Do not add fake data or fake open-room discovery.
- Do not introduce a new design system, Angular Material, 3D dice, new backend persistence, or unrelated Phase 5 work.
- Keep functions small and explicit; keep strict TypeScript and the existing lint/format conventions.
- Update tests whenever behavior changes.
- After each step, report changed files, checks run, failures, and the exact next command. Then stop.

## Step commands

### GO STEP 1 — audit only, no edits

Read the relevant files and the design reference. Compare the live implementation with `1a`, `1a2`, and `2a`. Produce:

1. a concise current-flow diagram;
2. a target-flow diagram;
3. a file-by-file implementation plan;
4. the host decision and whether shared state needs a minimal change;
5. the five-versus-six room-code conflict and the decision to preserve five;
6. a test and screenshot matrix for the required states.

Run only safe read-only checks if useful. Do not edit files. Stop after the analysis.

### GO STEP 2 — implement the entry flow only

Implement the initial nickname-first flow and join-code substep. Keep the waiting-room visual changes for Step 3.

Expected behavior:

- nickname is collected once and retained;
- `Start a table` creates/joins the generated room using the existing transport;
- `Join with a code` changes to the code step without sending a room join prematurely;
- code step has back navigation, five segmented slots, validation, pending state, and error recovery;
- successful create/join still reaches the existing Lobby through server confirmation;
- no Socket.io access is introduced into the component;
- connection status is moved out of the middle of the form into a quiet status area.

Update focused component tests. Run the relevant client tests, typecheck, lint, and build. Stop.

### GO STEP 3 — implement waiting room `2a`

Restyle the live Lobby to match the target waiting-room reference and wire real data into it.

Implement:

- one dark lantern-lit surface;
- room-code hero card with large code, Share invite, Copy, and accessible feedback;
- live roster and ready counts from state/config;
- host marker using the decision from Step 1;
- current-player row treatment and `(you)` marker;
- ready/not-ready text chips;
- responsive open-seat placeholders;
- prominent ready/cancel-ready action and minimum-player helper text;
- token-driven CSS and correct focus/hover/pressed/disabled states.

Do not change the game-start rule. Update Lobby tests and any minimal shared/server tests required by the host decision. Run client tests, typecheck, lint, and build. Stop.

### GO STEP 4 — verify the complete live flow and edge states

Exercise the real create → waiting room → second player join → mixed ready states → all-ready transition flow. Fix only issues within this task’s scope.

Verify explicitly:

- both users see the same roster and room code;
- each user sees only their own `(you)` marker;
- host is consistent from both clients;
- a ready change updates every connected client;
- one ready plus one not-ready does not start the match;
- the final required ready action reaches the existing opening-roll state;
- invalid join errors do not destroy the entered nickname/code;
- room code copy/share feedback is truthful;
- no hidden dice or game-state privacy regression is introduced.

Stop and report any backend contract that would need a separate product decision. Otherwise update tests and stop.

### GO STEP 5 — automatic sanity checks and browser E2E

Add or update the smallest maintainable Playwright setup using the existing `playwright` dependency. Do not replace the unit-test setup.

The browser test must start or connect to the local client/server, use at least two isolated browser contexts, and cover:

1. host enters nickname and creates a room;
2. guest enters nickname, opens the join-code step, enters the host’s five-character code, and joins;
3. both land on the waiting room;
4. host becomes ready while guest remains not ready;
5. both clients reflect the mixed state;
6. guest becomes ready and both clients leave the lobby through the existing start transition;
7. copy/share UI has a deterministic test stub and never reports success without the corresponding API result.

Run the full automatic checks from the repository root:

```text
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Then run the browser E2E command. If a check fails, fix the root cause and rerun it; do not hide failures or weaken assertions. Stop with the exact commands and results.

### GO STEP 6 — render and inspect the UI states

Use Playwright screenshots or the available browser tooling to render actual application pages, not only the static design HTML. Use at least 390×844 and one desktop viewport.

Capture these states with stable names in an ignored/temp artifact directory unless the repository already has a screenshot convention:

- `entry-empty.png`;
- `entry-nickname-filled.png`;
- `join-code-partial.png`;
- `join-code-complete.png`;
- `waiting-host-only.png`;
- `waiting-two-mixed-ready.png`;
- `waiting-three-mixed-ready.png`;
- `waiting-guest-perspective.png`;
- `opening-roll-after-all-ready.png`.

Inspect the screenshots against `designs/perudo-lobby-lantern.dc.html` sections `1a`, `1a2`, and `2a`. Check the actual visual details: no pale outer ring on the dark entry/waiting surface, no room code on the first entry step, strong primary contrast, one lantern-lit surface, code card hierarchy, open seats, host/ready readability, no clipped controls, no accidental horizontal overflow, and no excessive empty vertical gap. Fix visual defects and rerun the render check. Stop.

### GO STEP 7 — final audit and handoff

Review the diff for scope and regressions. Confirm:

- no unrelated files were changed;
- no raw design values were scattered outside tokens;
- no fake host authority or fake table discovery was added;
- the five-character code contract remains consistent;
- unit tests, browser E2E, typecheck, lint, format check, and build are green;
- the rendered states exist or their generation is reproducible;
- the waiting-room behavior still transitions into the existing game flow.

Report the final changed-file list, test commands/results, screenshot locations, any remaining product decision, and whether the work is ready for the user to review. Do not claim visual completion without inspecting the rendered screenshots.

