/**
 * Named table-wide die sizes (CSS px) — every place a `<app-die>` appears on the main table uses
 * one of these tokens instead of an arbitrary width class, so sizing stays consistent and
 * intentional rather than accidental (CLAUDE.md 8.2). Local hand dice are the largest/most
 * prominent element on the table; the public opening-roll die is comparably prominent (it's the
 * pre-game centerpiece); the current-bid marker and picker/suggestion controls are smaller but
 * must stay individually readable without zooming.
 */
export const DIE_SIZE_PX = {
  table: 48,
  openingRoll: 44,
  bidMarker: 36,
  picker: 40,
} as const;
