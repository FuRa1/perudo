# Claude Design prompt: the spectator seat

Extend `designs/perudo-mobile-consolidated.dc.html`. Do not start a new canvas, and take every
value from its `§0 Tokens` panel.

## The decision this implements

An eliminated player **stays at the table**. They are not returned to the entry screen and they are
not offered a rematch.

- They keep **their own seat**, and the table keeps showing they are there, until they choose to
  leave.
- They get a **reduced view**: no bid controls, no hand, nothing to act with.
- They **take no turn** and are **not part of the turn timer** — neither its owner nor its subject.
- They can still watch everything that is public: the arc, the wager, the reveal, the round chip.

Panel `13 Eliminated` currently assumes the player leaves. That assumption is now wrong. `13`
should become the _moment_ of elimination — the last die going — handing off to a persistent
spectator state, not an exit.

## What is already true in the build — design for this, not around it

The engine needs no change to support this, which was verified rather than assumed. It matters
because it tells you what the design is free to do:

- An eliminated player is **not in `turnOrder`** and **not in `pendingRolls`**. The round starts,
  proceeds and ends without ever waiting for them. There is no state in which the table is blocked
  on someone who is out.
- Every action they could send is already refused by the server (`NOT_YOUR_TURN`). The reduced view
  is not load-bearing for correctness — it exists so the screen stops offering things that cannot
  work.
- The turn timer only ever belongs to the current bidder, so it can never belong to them, and a
  disconnect by an eliminated player triggers nothing.
- They keep receiving the full filtered snapshot, so they see exactly what any other non-active
  player sees. Other players' dice stay hidden from them until the reveal, same as everyone.
- On the table, other players already see an eliminated seat as a dashed cup with a struck-through
  name and the word `out`.

What is **not** solved, and is the reason for this prompt: the app's arc draws _opponents only_.
The local player's presence on screen is their hand and their bid tray at the bottom. Remove both —
which is exactly what elimination does — and the player vanishes from their own screen. Right now
an eliminated player sees a bare table, a dead rule line where their hand used to be, and a waiting
bar reading "Mateo answers next", which is a sentence about a turn order they are no longer in.

## Draw these

**A. `13` reworked — the last die.** The elimination moment, in the same card shape as `09 Round
lost` and `10 Timed out`. It must read as final without reading as an exit: the match continues and
so does the player's presence. Note that the mobile decision in §3 removed `RoundLossModal`, so this
card is the only surface that can carry this — there is no dialog behind it.

**B. The spectator board, in each phase it can be in.** The same table as `06 Waiting`, minus
everything the player can no longer use, plus one thing they gained: **themselves, visible**.

- Waiting on someone's bid.
- The others rolling a new round.
- A reveal they are not part of.
- The opening cast of a round they will not play.

**C. Leaving.** Reachable, not prominent. A spectator who wants out should not have to hunt, and a
spectator who is engrossed should not be nudged toward the door.

## The questions the design has to answer

These are the ones the build cannot decide on its own:

1. **Where does the player see themselves?** The arc is opponents-only by construction. Either the
   spectator joins the arc as one more seat, or the vacated bottom zone becomes their own seat.
   Both are real options with different costs; pick one and say why.
2. **What occupies the bottom third?** It is roughly 40% of the screen and it currently holds the
   hand strip and the bid sheet. Left empty it reads as a broken layout, not as a quiet one.
3. **How does "you are out" persist without nagging?** It must be legible on return after looking
   away for a round, and must not be a banner the player resents by round three.
4. **What does the round chip say?** It currently reads `Round 4 · 12 dice`. That dice count is now
   about other people.
5. **The active player's timer is public.** Does a spectator see it? It is legitimate information
   about the table, but it is also the one element that most looks like it is addressed to them.
6. **The reveal.** A spectator sees every hand, including of players still in. Does the recap change
   at all when the reader has no stake in it?

## Constraints

- `§0 Tokens` only. No new colour, radius, shadow or type size.
- 390×844, holding at 320. Touch targets ≥ 44px.
- Dice privacy is unchanged: an eliminated player is a player, not an admin. They never see a live
  hand before the reveal.
- No spectator chat, no reactions, no emotes — none of that exists and this is not the place to
  propose it.
- Do not draw a rematch or "play again": there is no server intent for it.
- Do not restyle panels `00`–`12` or `14`–`17` as a side effect. If one must change, say which.
