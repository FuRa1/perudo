/** The arc's own sine curve (computeArcPosition) puts the topmost seat's *center* as little as
 * 4% down the arc box, and each card is centered on that point via `-translate-y-1/2` — so a
 * card's upper half can extend well above the arc box's own y=0. Harmless on its own, except the
 * arc sits inside a horizontally-scrolling wrapper, and setting `overflow-x` on an element
 * forces `overflow-y` to compute to `auto` too (a CSS quirk, not a bug we can select our way out
 * of) — so that clipped region was actually being cut off rather than merely overflowing
 * visibly. Padding the scroll wrapper by more than the tallest seat card's own half-height (large
 * tier, with a current-bid marker showing) gives every card room to render in full before the
 * scrollable box's content even starts. One constant for every tier rather than a tighter
 * per-tier value: simpler to reason about and verify, and the small amount of extra headroom at
 * smaller tiers matches the arc's own generous space in the design. */
export const ARC_TOP_PADDING_PX = 140;

/** Shrink proportionally as the table fills up (8.3); the arc container widens past this point
 * so cards stop shrinking below a legible floor and the row scrolls horizontally instead. */
export function seatSizeFor(opponentCount: number): 'large' | 'medium' | 'small' {
  if (opponentCount <= 4) {
    return 'large';
  }
  if (opponentCount <= 7) {
    return 'medium';
  }
  return 'small';
}

/** Gap between adjacent seat cards in the desktop/tablet arc row (`arcMinWidthPx`'s own unit). */
export const CARD_GAP_PX = 12;

interface ArcPosition {
  readonly left: string;
  readonly top: string;
}

/**
 * Table layout (8.3): my seat is fixed bottom-center; everyone else is spread across the top
 * arc of an oval, left to right — a plain sine curve rather than exact ellipse trigonometry,
 * which reads the same visually and is simpler to reason about than a full parametric ellipse.
 */
export function computeArcPosition(index: number, count: number): ArcPosition {
  if (count <= 1) {
    return { left: '50%', top: '18%' };
  }
  const marginPct = 10;
  const x = index / (count - 1);
  const left = marginPct + x * (100 - marginPct * 2);
  const archTopMin = 4;
  const archDepth = 26;
  const top = archTopMin + archDepth * (1 - Math.sin(Math.PI * x));
  return { left: `${left}%`, top: `${top}%` };
}

/** Ellipse position for the Clockwise dashboard (Phase 3) — `x = cx + rx·cos θ`,
 * `y = cy + ry·sin θ`, `θ = start + (index/count)·2π`. `start` is `-π/2` so seat 0 sits at the top
 * of the ring rather than the 3-o'clock position `cos`/`sin` default to. Radius is fixed here;
 * Phase 3 makes it a continuous function of `count` per the plan's player-count scaling rule. */
export function computeRingPosition(index: number, count: number): ArcPosition {
  if (count <= 1) {
    return { left: '50%', top: '18%' };
  }
  const rx = 42;
  const ry = 34;
  const start = -Math.PI / 2;
  const theta = start + (index / count) * 2 * Math.PI;
  const left = 50 + rx * Math.cos(theta);
  const top = 50 + ry * Math.sin(theta);
  return { left: `${left}%`, top: `${top}%` };
}
