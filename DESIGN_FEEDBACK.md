# Design feedback — emulator playtest (2026-11-04)

Collected while playing real matches on Genymotion devices (Galaxy S23 1080×2340, Pixel 2
1080×1920, small "Phone" 570×1230; later 3 more devices for 6-player checks). Items marked
**(owner)** are the project owner's own words, kept as close to the original as possible; the
rest are observations made during the same session. Screenshot names below refer to local,
gitignored dev-test captures in `screens/playtest-2026-11-04/` on the playtest machine.

Canonical reference remains `designs/perudo-mobile-consolidated.dc.html` (see `ISSUES.md`).

**Overall verdict (owner):** the design is "far from OK", and on Pixel 2 the layout is
"destroyed". The layout needs to become genuinely adaptive across small phones, tall phones and
tablets, not tuned for one viewport.

## Layout and adaptivity

1. **(owner)** The player's own dice row is shifted to the right instead of centred (S23 and
   Pixel 2).
2. **(owner)** The opponents' arc is shifted off-centre.
3. **(owner)** Pixel 2, bidding: two stray horizontal lines at the top where the opponent seats
   should be. Opponent tiles appear to collapse into lines at this height. See
   `07-before-2x6.png`.
4. **(owner)** Think about a more dynamic, adaptive layout overall. A tablet will be added to the
   test devices, and 6-player tables must be checked on several layout types.
5. The reveal card's bottom is clipped by the system navigation bar on S23/Pixel 2
   (`12-reveal-settled.png`).
6. Opening roll has a large dead area in the middle of the table (`02-opening-roll.png`).

## Components

7. **(owner)** Hint chips (Min / Aces / Face): the text sits right against the border, with no
   inner padding.
8. **(owner)** Opponent seat tiles: the corner radius goes the wrong way. It should mirror the
   table's curve.
9. **(owner)** Bid controls (quantity/face steppers, Place bid / Call liar): the radius is far
   too large. Align with a modern, consistent radius scale used everywhere.
10. The Cast / Roll your hand buttons: the icon touches the label, with no gap.

## Opening roll

11. **(owner)** The dashed empty die slots (one per opponent, plus a large one for "Your cast")
    look broken and unclear. It's not obvious they mean "not cast yet / who goes first". Reconsider
    whether a placeholder die is needed at all. The "tap the die" hint also points at an empty
    dashed outline. See `02-opening-roll.png`.

## Reveal

12. **(owner)** The counted dice are barely visible: the light-orange ring is too faint. Proposal:
    keep counted dice bright and make the non-counted dice semi-transparent, without the ring,
    with a short fade animation as the reveal settles. Revisit the palette for this state. See
    `15-special-reveal.png`, `12-reveal-settled.png`.
13. **(owner)** Vertical rhythm on the reveal card: the ring legend and its caption sit right on
    top of the last dice row. Needs consistent spacing between the verdict, the dice rows and the
    footer lines.
14. While the loss modal closes, it fades out on top of the reveal card. For a moment both are
    visible, semi-transparent, overlapping "Roll your hand" (`11-reveal.png`). This is related to
    the existing `ISSUES.md` item "Recompose the mobile reveal, and stop presenting
    RoundLossModal there".

## Special round

15. When a special round (Palafico) is declared, **no player sees any indication**. Aces silently
    stop being wild and the face silently locks (the face stepper just stops responding). It needs
    a visible state (chip/banner) for everyone, plus a visibly locked face control
    (`14-special-round-next.png`).
