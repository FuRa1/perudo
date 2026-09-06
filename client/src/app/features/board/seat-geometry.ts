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

export interface ArcPosition {
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

/** Degrees of the ring left open at the bottom (designs/perudo-spotlight-gallery.dc.html, Variant
 * B: "a 60° gap at the bottom for the legend") — the reserved band where the local player's own
 * hand/bid controls actually live on a real screen, so the ring never draws a seat there. */
const RING_GAP_DEG = 60;

/** `x = cx + rx·sin θ`, `y = cy - ry·cos θ` — a clockwise-from-top parameterization (θ=0 is the
 * top/12 o'clock position, θ increases clockwise), matching the ring's own "↻ Clockwise" framing
 * more directly than the plan's original `cos`/`sin` sketch, which started seats at 3 o'clock.
 * Seats fill every degree of the ring *except* the bottom `RING_GAP_DEG` band: index 0 (next to
 * act) sits just clockwise of one gap edge, the last index just short of the other. */
export function computeRingPosition(index: number, count: number): ArcPosition {
  if (count <= 1) {
    return { left: '50%', top: '18%' };
  }
  const { rx, ry } = ringRadiusPercent(count);
  const usableDeg = 360 - RING_GAP_DEG;
  const startDeg = 180 + RING_GAP_DEG / 2;
  const stepDeg = count > 1 ? usableDeg / (count - 1) : 0;
  const theta = ((startDeg + index * stepDeg) * Math.PI) / 180;
  const left = 50 + rx * Math.sin(theta);
  const top = 50 - ry * Math.cos(theta);
  return { left: `${left}%`, top: `${top}%` };
}

interface RingRadius {
  readonly rx: number;
  readonly ry: number;
}

/** Player-count scaling is formula-driven, not breakpointed (dashboard-switching plan, decision
 * 7): a fuller ring needs slightly more room to keep 11 seats legible, so the radius eases
 * outward as `count` grows rather than snapping between fixed tiers. Endpoints read directly off
 * designs/perudo-spotlight-gallery.dc.html's B-4P/B-12P panels (rx 44%→48%, ry ~30%→~35% of the
 * 390×844 frame) — the build interpolates between them, per that file's own closing note. */
export function ringRadiusPercent(opponentCount: number): RingRadius {
  const t = Math.max(0, Math.min(1, (opponentCount - 3) / (11 - 3)));
  return { rx: 44 + t * (48 - 44), ry: 30 + t * (35 - 30) };
}

const RING_SEAT_SIZE_MAX_PX = 44;
const RING_SEAT_SIZE_MIN_PX = 34;
/** The floor Decision 7 describes ("seat size easing toward the 30px floor") for tables larger
 * than the reference's own 12-player ceiling, so a hypothetical denser ring never shrinks a seat
 * below what's still tappable/legible. */
const RING_SEAT_SIZE_FLOOR_PX = 30;

/** 44px at a light table down to 34px at the reference's full 11-opponent ring, continuing to
 * ease toward the 30px floor beyond that rather than stopping dead at 34px. */
export function ringSeatSizePx(opponentCount: number): number {
  const t = Math.max(0, Math.min(1, (opponentCount - 3) / (11 - 3)));
  const eased = RING_SEAT_SIZE_MAX_PX + t * (RING_SEAT_SIZE_MIN_PX - RING_SEAT_SIZE_MAX_PX);
  return Math.max(RING_SEAT_SIZE_FLOOR_PX, eased);
}

/** Seats dim with distance from the light — but only the tail of the queue, not by raw ring
 * position (designs/perudo-spotlight-gallery.dc.html's own B-12P panel dims seats 10/11, the
 * *last* two to act, to .7/.55, while seat 1 — geometrically just as close to the bottom gap —
 * stays fully lit because it's NEXT). `indexFromEnd` is 0 for the very last seat in the waiting
 * order. Continuous rather than a hard two-seat cutoff, so a mid-sized table doesn't visibly snap. */
export function ringSeatOpacity(indexFromEnd: number, count: number): number {
  if (count <= 2 || indexFromEnd >= count) {
    return 1;
  }
  const taper = Math.max(0, Math.min(1, 1 - indexFromEnd / 2));
  return 1 - taper * 0.45;
}
