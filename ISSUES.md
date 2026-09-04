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

## Open

### Two approved design files disagree on the player-identity colour

- **Logged:** 2026-09-04, during the design-parity pass.
- `designs/perudo-lobby-lantern.dc.html` gives each roster seat its own avatar gradient — brass
  (`#e3bd7e→#8a5c26`) for "you", sage (`#8e9c6c→#4b5730`) for the next player.
  `designs/mobile-lantern.dc.html` makes every arc seat a uniform wood-brown. The app follows the
  second: one `--color-identity-start/end` gradient for every seat (`lobby.scss`'s
  `.lobby__avatar`).
- Phase 4's token audit chose wood-brown and recorded that "the old brass-toned identity gradient
  matched no colour in the approved design" — but it had only checked `mobile-lantern.dc.html`.
  That note is wrong as written; the two files genuinely conflict.
- **Needs a decision on which file wins for identity tiles.** None of the lobby design's per-seat
  colours are current tokens, so following it means adding some.
- Not blocking: the entry-screen brand badge, which shared the same gradient, was changed to brass
  on 2026-09-04 — it is the app's logo mark, not an identity tile, and only one reference draws it
  (the wood version also had almost no contrast on the dark backdrop). That fix does **not** settle
  the question above.

### Reveal verdict block — reference and internal consistency point different ways

- **Logged:** 2026-09-04.
- `screens/Screenshot 2026-08-16 002742.png` renders the verdict as a large Pirata One word ("Bid
  false") with the explanation inline beside it on a peach fill. The app uses a small
  letter-spaced caps label stacked above the explanation in a full-radius pill.
- The app's treatment is not an accident: it deliberately matches `round-loss-modal.scss`'s
  `.round-loss__verdict`. Changing one alone reintroduces an inconsistency; changing both is a
  design-system decision, not a parity fix.
- The reference only ever shows the loss ("false") variant. The app's "true" variant (sage) has no
  reference at all.

### `describeBid` face wording — "N × face M" vs "N × fives"

- **Logged:** 2026-09-04.
- A pure display string (`table.ts`), but shared across three table templates plus the desktop
  banner, and asserted by two `table.spec.ts` cases.
- The design system contradicts itself on it: `perudo-mobile-board.dc.html` says "4 × five"
  (singular), `screens/Screenshot 2026-08-16 002742.png` says "4 × fives" (plural).
- Needs a decided wording before touching shared display code and tests.

### Lobby roster subline and header back-affordance

- **Logged:** 2026-09-04.
- The design shows a secondary line per roster row ("Host · set the rules", "Joined a moment ago")
  and a back-arrow where the app shows the wordmark.
- The `Player` model carries no timestamp, so "joined N ago" cannot be rendered truthfully (already
  noted in `lobby.scss`), and the header change is structural navigation. Both are added content,
  not a token nudge.

### Round chip wording during reveal

- **Logged:** 2026-09-04. Minor.
- Design pill reads "Round N · revealed"; the app's reads "Round N · M dice", the same
  `describeMobilePhase` format it uses in every non-your-turn phase. The helper is shared, so a
  reveal-specific branch is a small but real behaviour change.

### Open question — true game save/restore across a server restart

- **Logged:** 2026-09-04. Full context: [STATE_FIXTURES_AND_SAVE_PLAN.md](STATE_FIXTURES_AND_SAVE_PLAN.md) §2.
- Not the same as Phase 5's reconnect-by-token, which only covers a still-running server. This
  would mean surviving the **server process restarting**, directly reversing CLAUDE.md §3.3's
  "deliberate MVP limitation, do not add a DB/Redis".
- A user decision (§12 territory), not built. The other half of that request — the dev-only fixture
  preview mode — was built the same day.
