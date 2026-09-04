# Claude Design prompt: complete `perudo-mobile-consolidated` as the single source of truth

Open `designs/perudo-mobile-consolidated.dc.html` and extend it. Do not start a new canvas.

## Why this file specifically

This file is **the basis for the Perudo design**. Where it disagrees with any other file under
`/designs`, it wins — that has been confirmed and is now recorded at the top of `ISSUES.md` and in
`CLAUDE.md`.

That matters because the older files contradict it and each other, and the app was built partly
against them. Two concrete examples of the damage: `perudo-lobby-lantern.dc.html` gives every lobby
seat its own avatar colour while this file colours them by role (terracotta for the local player,
translucent cream for everyone else) — the app followed the wrong one until it was corrected on
2026-09-04. `mobile-lantern.dc.html` was treated as canonical and several colour tokens were
derived from it alone, on an incomplete basis.

So the goal here is not more screens for their own sake. It is to make **one file** that a
developer can implement from without ever opening another, and without reverse-engineering values
out of markup.

## What is already correct — do not redraw these

Panels `01 Nickname` through `08 Reveal` are implemented and matched in the live app. Leave their
layout, colour and copy alone unless something below forces a change:

`01 Nickname` · `02 Room code` · `03 Lobby` · `04 Opening cast` · `05 Hand roll` · `06 Waiting` ·
`07 Your bid` · `08 Reveal`

Your own "Still to build" note lists _"Lantern skin for entry and lobby — both screens still ship
Ionic defaults"_. That is out of date: entry and lobby are now fully themed to these panels. The
rest of that note is still accurate and is the starting point below.

## 1. Publish the tokens as a panel (highest value — please do this first)

Add a **`00 Tokens`** panel: a visible legend of every colour, radius, shadow, type size and
weight this file uses, each with its literal value and the role it plays.

Reason: there is no `_ds` bundle vendored alongside these files, so a developer reads values
straight out of the inline markup. That is how the app ended up with a near-invisible wood-brown
brand badge, a room-code card wearing the end-card treatment, and dice with 30% dead padding — all
of them plausible readings of markup that never said what a value was _for_.

Please distinguish, explicitly:

- **Surfaces** — the dark table, the light card, the translucent on-table fill, the scrim.
- **Identity vs role.** This file uses wood `#6b4f31→#33261a` for the table's cup silhouettes and
  terracotta `#c67139` for the local player's lobby avatar. Those are different jobs. Say so.
- **Warm accents.** `#c67139`, `#f0c98d`, `#8c491a` and the several `rgba(255,2xx,1xx,·)` glows are
  currently indistinguishable in the markup. Name each one's role.
- **Which greys are text and which are fills**, at what alpha.

If a value appears once, say it is a one-off. If two values are deliberately near-identical, say
which is which and why.

## 2. Add the states the app has and this file does not

Each of these exists in the running app today. Some are drawn in the older files — in their
conflicting visual language. Redraw them **in this file's language**, superseding those.

| State                       | Currently drawn in                           | Notes                                                                                                          |
| --------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Round lost (die taken)      | `perudo-mobile-flow` · `perudo-mobile-board` | See the conflict in §3 before drawing this.                                                                    |
| Match won / match lost      | `perudo-mobile-flow` ("M Win card")          | Every player reaches it, not just the winner. The stat tiles there (rounds, calls won) are data we don't have. |
| Palifico / special round    | `perudo-mobile-flow` ("M Palifico")          | Your note asks for "a header chip state and a locked face stepper" — that is the right shape.                  |
| Disconnect / reconnect      | `perudo-mobile-flow` ("M Connection lost")   | Your note: _"nothing covers a drop mid-round"_. Still true.                                                    |
| 9–12 players                | `perudo-mobile-board` ("05 Twelve players")  | The app splits these into two arc rows; the back row needs to read as subordinate.                             |
| **Turn timed out**          | **nowhere**                                  | Never designed. See §4.                                                                                        |
| **Turn timer phases**       | **nowhere**                                  | See §4.                                                                                                        |
| **Error / rejected action** | **nowhere**                                  | See §4.                                                                                                        |

## 3. Resolve the conflicts this file already flags

Your "Still to build" notes raise two that are live problems in the app right now:

**Reveal vs RoundLossModal.** The note says _"two surfaces can describe the same loss; the panel
above assumes the modal is suppressed on mobile."_ The app currently shows **both** — the reveal
panel and a separate round-loss modal over it. Please decide and draw it: either the modal goes
away on mobile and `08 Reveal` carries the loss, or the modal is the loss surface and the reveal
panel drops that content. Right now the same event is narrated twice.

**Next round affordance.** The note says _"reveal currently lingers with no explicit continue — the
Next round button is new."_ The app has no such button; the roll button doubles as one, which was a
deliberate call but predates this file. `08 Reveal` also composes the recap as a card at the top of
its own screen, whereas the app renders it as a panel inside the table below the roll button.
Please confirm the intended composition, since it decides whether this is a restyle or a rework.

## 4. States with no design at all

These are implemented and player-visible, and nothing in `/designs` covers them.

- **Turn timed out (rule 5.7).** After 25s plus a 30s personal bank, an idle player loses a die and
  the round ends. There is also a **double-loss protection**: a second consecutive pure stall costs
  nothing, the turn just passes. Those are two visibly different outcomes and neither is drawn.
- **Turn timer phases (rule 5.6).** Three states on one control: quiet 0–15s, an audible warning
  15–25s, then the personal bank draining. The app shows `0s`; this file's `07 Your bid` shows
  `0:07`, which is better — please carry the mm:ss form into an explicit three-phase spec.
- **Error / rejected action (4.2).** Illegal bid, not your turn, wrong phase, room full, invalid
  token. Currently a plain toast.

## Hard constraints — these come from the rules, not from taste

- **2–12 players**, 5 dice each at the start. Room code is **5 characters**.
- **No avatars.** Nickname only; identity is an initial or a deterministic decorative mark. Do not
  draw faces or portraits.
- **Dice privacy.** A player sees only their own dice until the reveal. Never draw an opponent's
  hand face-up before `08 Reveal`.
- **Aces are wild** and bids climb one monotonic scale; in a special round aces are _not_ wild and
  the face is locked, quantity-only. An exact count means the **caller** loses.
- **No voting** on disconnects — a dropped player is handled by the ordinary turn timer.
- **Touch targets ≥ 44px**; primary and destructive actions 56px tall.
- **390×844 is the target**, and it must also hold at **320px** with no horizontal scroll.
- Never surface raw state-machine names (`ROUND_ROLLING`) to a player.

## Please don't

- Don't introduce a colour, radius or shadow that isn't in the `00 Tokens` panel.
- Don't add bitmap art. Everything stays inline markup, as the existing panels are.
- Don't invent data the server doesn't have — no "joined 2 minutes ago", no per-match statistics,
  no table browser. If a panel needs such a field, mark it clearly as not-yet-available.
- Don't restyle panels `01`–`08` as a side effect. If one must change, say which and why.
