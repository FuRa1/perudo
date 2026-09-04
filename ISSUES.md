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
user, 2026-09-04). Its eight panels — nickname, room code, lobby, opening cast, hand roll, waiting,
your bid, reveal — cover the whole flow, and where it disagrees with any other file under
`/designs`, it wins.

This settled five questions that had been open here as "two approved files disagree". It also means
`designs/mobile-lantern.dc.html`, which CLAUDE.md's Phase 4 note calls "the canonical lantern cabin
table scene", is **not** the authority it was treated as — several earlier token decisions were
made against it alone. Anything still traced to that file is worth re-checking.

Compare against it with `npm run design:compare -w client` (see `client/README.md`); render the
`.dc.html` panels rather than reading hex values out of the markup.

---

## Open

### Reveal is a panel inside the table; the canonical draws it as its own screen

- **Logged:** 2026-09-04.
- Canonical panel "08 Reveal" puts the recap card at the **top** of the screen, on the dimmed
  table, with a "Next round" primary action pinned at the bottom. The app renders it as a panel in
  the table's normal flow, below the "Roll your hand" button, with no CTA of its own (the roll
  button doubles as one — a deliberate earlier choice, see CLAUDE.md 2026-09-04).
- Everything _inside_ the card now matches the canonical (verdict, wording, rows, caption, closing
  summary). This is the remaining structural difference, and it is a real rework of how the reveal
  state is composed — not a token change.

### Not yet aligned to the canonical file

Straightforward work, listed so it isn't rediscovered. None of it is blocked on a decision:

- **Arc seat shape.** Canonical draws each opponent as a wood **cup silhouette** (dome top, flat
  base, no letter). The app uses a rounded square carrying the player's initial.
- **Wager caption.** Canonical: "Mateo's bid — your turn" in terracotta, sentence case. The app:
  uppercase, muted grey.
- **Hint chips.** Canonical: compact text, "Min · 5×5" / "Aces · 3×1". The app: "Min: 1 × [die]"
  with a rendered die.
- **Turn timer.** Canonical shows "0:07" (mm:ss). The app shows "0s".
- **Entry nickname field.** Canonical: a "NICKNAME" kicker label _above_ a pill-shaped field. The
  app uses Ionic's floating in-field label in a rounded rect — an Ionic-pattern choice, so this one
  has a real tradeoff against the framework's defaults.
- **Entry actions.** Canonical bottom-anchors "Start a table" / "Join with a code"; the app puts
  them directly under the field.

### Open question — true game save/restore across a server restart

- **Logged:** 2026-09-04. Full context: [STATE_FIXTURES_AND_SAVE_PLAN.md](STATE_FIXTURES_AND_SAVE_PLAN.md) §2.
- Not the same as Phase 5's reconnect-by-token, which only covers a still-running server. This
  would mean surviving the **server process restarting**, directly reversing CLAUDE.md §3.3's
  "deliberate MVP limitation, do not add a DB/Redis".
- A user decision (§12 territory), not built. The other half of that request — the dev-only fixture
  preview mode — was built the same day.
