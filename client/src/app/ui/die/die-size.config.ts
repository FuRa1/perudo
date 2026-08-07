/**
 * Named table-wide die sizes (CSS px) — every place a `<app-die>` appears on the main table uses
 * one of these tokens instead of an arbitrary width class, so sizing stays consistent and
 * intentional rather than accidental (CLAUDE.md 8.2). Local hand dice are the largest/most
 * prominent element on the table; the picker/suggestion controls are smaller but must stay
 * individually readable without zooming.
 *
 * The opening-roll die and the current-bid marker's die are prominent, must-read-at-a-glance
 * elements with their own responsive floor-to-ceiling sizing instead — see `.opening-roll-die`
 * (ui/opening-roll-panel/opening-roll-panel.scss) and `.bid-marker__die`
 * (ui/bid-marker/bid-marker.scss), both built on the shared `clamp-square` mixin
 * (theme/_mixins.scss).
 */
export const DIE_SIZE_PX = {
  table: 48,
  picker: 40,
} as const;
