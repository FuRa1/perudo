# Known issues / backlog

Things found while working that were **not** fixed in the moment — out of scope for the task at
hand, needing more investigation than a quick pass allowed, or a deliberate judgment call worth
someone else's sign-off. Enough context that whoever picks one up (including a future agent session
with no memory of how it was found) doesn't have to rediscover it.

**This file is only what's still open.** Closed entries move to [RESOLVED.md](RESOLVED.md) — a
backlog nobody can read at a glance stops being a backlog. The durable record of a fix is the code
comment at the point of the fix plus the commit that made it, so a closed entry is narrative, not
reference material, and doesn't belong in front of the open work.

---

## The canonical design reference

**`designs/perudo-mobile-consolidated.dc.html` is the basis for the design** (confirmed by the
user, 2026-09-04). Where it disagrees with any other file under `/designs`, it wins.

It now covers every state a player can reach, not just the eight-panel happy path:

- `00 Tokens` — every colour, radius, shadow, type size and touch dimension the file uses, each
  with the role it plays. **Read values from there, not out of the markup.** It is explicit about
  the distinctions the app has already got wrong once: wood `#6b4f31→#33261a` is the material of a
  cup (scenery, never a badge or button), terracotta `#c67139` means "yours, or the action", brass
  `#f0c98d` is ink and a hairline but never a fill, cream at alpha is always a fill and never text.
- `01`–`08` — arrival and the round.
- `09`–`13` — round lost, turn timed out, protected stall, match won, eliminated.
- `14`–`17` — palifico, mid-round disconnect, refused action, twelve players.

Two known flags recorded in `00 Tokens` rather than silently drawn: the room-code back button is
drawn 42px and must be built at 44, and the die pip grid uses padding ≈ 0.16× and pip ≈ 0.19× the
face (larger padding is what produced the dead-space dice).

`designs/mobile-lantern.dc.html` is **not** the authority CLAUDE.md's Phase 4 note calls it —
several token decisions were made against it alone. Anything still traced to that file is worth
re-checking against `00 Tokens`.

Compare against it with `npm run design:compare -w client` (see `client/README.md`); render the
`.dc.html` panels rather than reading hex values out of the markup.

---

## Open

### Recompose the mobile reveal, and stop presenting RoundLossModal there

- **Logged:** 2026-09-04. Decided in the canonical file, §3.
- **Decision: the reveal card is the only loss surface on mobile.** It already carries strictly
  more than the modal does — every hand, the ringed counted dice, the verdict, the closing summary,
  where the modal shows only claimed vs actual — and it needs no dismissal before play continues.
  Keep `RoundLossModal` for desktop; do not present it from the mobile board.
- The modal's one unique job was the "Time ran out" branch, which has no reveal behind it. That
  becomes its own panel (`10 Timed out`) in the same card shape, so nothing is lost by removing it.
- **Decision: the canonical composition is confirmed**, which makes this a rework rather than a
  restyle — recap card at the top over a scrimmed table, `Next round` pinned at the bottom, roll
  button hidden in this state. The roll button no longer doubles as continue.
- Cheapest partial if the rework has to wait: relabel the roll button to "Next round" while the
  reveal is up. That removes the wrong-label problem, not the composition problem.

### Designed in the canonical file, not yet built

- **Turn timeout, both outcomes (rule 5.7).** A die-losing stall gets a card (`10`); a protected
  second consecutive stall gets a brass ribbon, takes nothing and interrupts nothing (`11`). They
  must not share a surface — a card means you paid, a ribbon means you didn't.
- **Turn timer, three phases in mm:ss (rule 5.6).** Quiet 0–15s (outline, silent), audible warning
  15–25s (terracotta wash, brass ink, 1s pulse), personal bank draining (the word "bank", challenge
  outline, a hairline drain bar), then spent (quiet grey, stays on screen through `10` so the cause
  of the loss is still legible). The chip currently renders `0s` with no phase at all. Both
  durations are `TIMING_CONFIG` values, not constants.
- **Palifico as a phase, not a warning (`14`).** Brass-edged round chip naming who triggered it, a
  rule ribbon stating both changes in the player's words, the face stepper locked while the
  quantity stepper stays at full strength, and a `Face locked · N` hint chip. Replaces
  `declareSpecialRound()`'s raw warning button.
- **Refusals without dialogs (rule 4.2, `16`).** If the player can fix it where they are, the
  message takes the hint row's slot at the same height so nothing moves; only an error whose
  surface is already gone gets a toast. Five strings specified, none of which names a state
  machine value.
- **Mid-round disconnect (`15`).** `sessionRestoreFailed()` is entry-only. The in-game drop holds
  the table visible at 50% under the scrim, states honestly that the turn timer keeps running and
  that there is no vote, and turns terminal when retries are exhausted. Rejoin is a ribbon stating
  current state, never a diff.
- **An end card for every player (`12`, `13`).** Won and eliminated are one screen with different
  subtraction. Standings are placement plus "out in round N" only.
- **Twelve players (`17`).** Above 8 opponents, two flex rows; the back row must read as further
  away on four cues at once (opacity, cup size, pip size, padding), because size alone reads as a
  rendering bug.

### Spectator seat for eliminated players

- **Decided 2026-09-04 by the user**, closing the earlier open question. An eliminated player
  **stays at the table**: they keep their seat, the table keeps showing they are present until they
  choose to leave, and they get a reduced view — no bid controls, no hand, no turn, and no part in
  the turn timer. They still see everything public.
- Design brief: [`designs/perudo-spectator-claude-prompt.md`](designs/perudo-spectator-claude-prompt.md).
  Panel `13 Eliminated` currently assumes they leave and needs reworking into the _moment_ of
  elimination handing off to a persistent spectator state.
- **The turn/timer/visibility flow needs no server, engine or shared change — verified, not
  assumed.** The flow cannot be blocked by a spectator because:
  - `buildTurnOrder` filters on `diceCount > 0`, so an eliminated player is never in `turnOrder`,
    and every turn guard compares against `turnOrder[currentTurnIndex]` — their intents are already
    refused with `NOT_YOUR_TURN`.
  - `pendingRolls` is seeded from `turnOrder`, so a round never waits for them to roll.
  - `TurnTimerService` only ever owns the current bidder, and `onPlayerDisconnected` is a no-op
    unless the disconnecting player owns the timer — so an eliminated player dropping does nothing.
  - `selectPlayerView` keeps them in `players` and only blanks _other_ people's dice, so they keep
    receiving the same filtered snapshot as anyone else.
- **One shared change turned out to be needed after all, and is now built.** Claude Design's brief
  came back asking for "out in round N" on both the spectator plinth and the end card (`12`/`13`) —
  the app had nowhere to get that from. Added `Player.eliminatedInRound: number | null`
  (`shared/src/types/state.types.ts`), stamped in `finishRoundAfterLoss` (`game-engine.ts`) — the
  one place both loss paths (reveal and timeout) funnel through — using the round that was current
  when the last die was lost, not the round about to start. 3 new engine tests cover both loss
  paths and confirm the field stays `null` for a loss that doesn't eliminate.
- **The work is client presentation only** beyond that one field, and the reason it is needed: the
  arc draws _opponents only_, so the local player's whole on-screen presence is their hand strip and
  bid tray. Remove both — which is what elimination does — and the player disappears from their own
  screen. Today an eliminated player sees a bare table, a dead rule line where the hand was, and a
  waiting bar reading "Mateo answers next", about a turn order they are no longer in.
- **A related bug found while checking the design's timer answer, fixed alongside this.** The brief
  assumed "the chip only pulses/beeps/banks for your own clock" was already true and just needed to
  stay true for a spectator. It wasn't: `TurnTimer`'s `isMine` input was accepted and never read, so
  the warning beep fired for every connected client on every turn, not just the turn's owner. Fixed
  by gating the beep effect on `isMine()` (`client/src/app/ui/turn-timer/turn-timer.ts`); 2 tests
  added covering both the owner and non-owner case. This was already wrong for every player at the
  table, not spectator-specific — a spectator would just have been one more unaffected listener.
- Known copy to revisit when this is built: `RoundLossModal.lossSummary` already says "You lost your
  last die — you're out.", but the canonical decision removes that modal from mobile, so panel `13`
  has to carry the line instead.
- Not yet built: the panel rework itself (`13` reworked, the spectator board states, the plinth,
  leave affordance) — Claude Design's answers are recorded above and in
  `designs/perudo-spectator-claude-prompt.md`, but the `.dc.html` file has not been updated with
  them yet.

### Not yet aligned to the canonical file

Straightforward work, listed so it isn't rediscovered. None of it is blocked on a decision:

- **Arc seat shape.** Canonical draws each opponent as a wood **cup silhouette** (dome top, flat
  base, no letter). The app uses a rounded square carrying the player's initial.
- **Wager caption.** Canonical: "Mateo's bid — your turn" in terracotta, sentence case. The app:
  uppercase, muted grey.
- **Hint chips.** Canonical: compact text, "Min · 5×5" / "Aces · 3×1". The app: "Min: 1 × [die]"
  with a rendered die.
- **Entry actions.** Canonical `01 Nickname` bottom-anchors "Start a table" / "Join with a code";
  the app puts them directly under the field. (Re-checked against the extended file on 2026-09-04 —
  still a real delta. Entry and lobby are _themed_ now, which is a separate thing from this
  layout.)
- **Entry nickname field.** The only other remaining entry-screen delta: the canonical draws a
  "NICKNAME" kicker label _above_ a pill-shaped field, the app uses Ionic's floating in-field label
  in a rounded rect. A real tradeoff against framework defaults, so it wants a decision rather than
  a fix.

### Open question — true game save/restore across a server restart

- **Logged:** 2026-09-04. Full context: [STATE_FIXTURES_AND_SAVE_PLAN.md](STATE_FIXTURES_AND_SAVE_PLAN.md) §2.
- Not the same as Phase 5's reconnect-by-token, which only covers a still-running server. This
  would mean surviving the **server process restarting**, directly reversing CLAUDE.md §3.3's
  "deliberate MVP limitation, do not add a DB/Redis".
- A user decision (§12 territory), not built. The other half of that request — the dev-only fixture
  preview mode — was built the same day.
