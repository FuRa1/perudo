/**
 * Deterministic final resting layouts for the dice cup (client presentation only). Distinct from
 * the random scattered/chaotic positions used mid-shake (dice-physics.ts) — once settling
 * begins, dice must land in a clearly spaced, non-overlapping, deliberate arrangement rather than
 * random final spots. Pure and framework-free, same reasoning as dice-physics.ts.
 */

import type { CupBounds, Vec2 } from './dice-physics';

/** Deliberate angular arrangement per supported dice count (radians, 0 = +x/"east"), not a
 * generic even spread — chosen so each count reads as an intentional shape: 2 balanced
 * left/right, 3 a triangle apex-up, 4 four balanced corners, 5 a quincunx ring (echoing a die's
 * own five-pip face) around the ring returned for count 5's outer four. */
function ringAnglesFor(diceCount: number): readonly number[] {
  switch (diceCount) {
    case 2:
      return [0, Math.PI];
    case 3:
      return [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    case 4:
      return [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    case 5:
      return [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    default:
      // Not expected in practice (a hand never exceeds 5 dice), but stays well-defined.
      return Array.from({ length: diceCount }, (_, i) => (i / diceCount) * Math.PI * 2);
  }
}

/** The circumradius needed so that every pair of adjacent ring points is exactly `minSeparation`
 * apart. For 5 (quincunx: center + 4 corners), the binding constraint is center-to-corner, which
 * equals the radius itself — corner-to-corner (radius×√2) is then automatically well clear. */
function requiredCircumRadius(diceCount: number, minSeparation: number): number {
  if (diceCount <= 1) {
    return 0;
  }
  if (diceCount === 5) {
    return minSeparation;
  }
  return minSeparation / (2 * Math.sin(Math.PI / diceCount));
}

/**
 * Computes stable, non-overlapping final resting positions for `diceCount` dice inside the
 * cup's inner bowl.
 *
 * - `dieHalfSize` is the full visual die's half-width (not the smaller physics collision radius
 *   used during the chaotic shake — final positions must not overlap, so the real footprint is
 *   used here).
 * - `gap` is the minimum visible gap between adjacent dice.
 * - Every returned position is clamped so the die (inset by `dieHalfSize`) stays inside the
 *   bowl's inscribed circle, which is always inside the bowl ellipse itself — "validate/clamp
 *   every final position inside the inner bowl".
 * - Pure function of its inputs: safe to call again whenever bounds/count change, always
 *   returning a fresh, correctly-fitted layout (no accumulated state).
 */
export function computeFinalLayout(
  diceCount: number,
  bounds: CupBounds,
  dieHalfSize: number,
  gap: number,
): readonly Vec2[] {
  if (diceCount <= 0) {
    return [];
  }
  if (diceCount === 1) {
    return [{ x: 0, y: 0 }];
  }

  const minSeparation = 2 * dieHalfSize + gap;
  const usableRadius = Math.max(Math.min(bounds.radiusX, bounds.radiusY) - dieHalfSize, 1);
  const idealRadius = requiredCircumRadius(diceCount, minSeparation);
  const radius = Math.min(idealRadius, usableRadius);

  const ringPositions = ringAnglesFor(diceCount).map((angle) => ({
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }));
  return diceCount === 5 ? [{ x: 0, y: 0 }, ...ringPositions] : ringPositions;
}
