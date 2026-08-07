import type { SeatSize } from '../seat-card/seat-card';

/**
 * Everything visual/tunable about the dice cup lives here — sizes, phase durations, physics
 * tuning per phase. No cup color or texture path is ever written directly into a component
 * template; templates only reference the CSS classes below (`DICE_CUP_CSS_CLASS`), which in turn
 * reference the CSS custom properties defined once in dice-cup.scss. A future texture-backed or 3D
 * cup renderer only has to replace those CSS values (or swap this whole component for another
 * one implementing the same SeatCard-facing input contract: dice/diceCount/isOwner/isRolling) —
 * nothing in match state, socket logic, or SeatCard's public contract has to change.
 */

/** Closed opponent-cup diameter in CSS pixels per SeatCard size tier — the closed cup has no
 * dice to lay out, so it stays on the simple fixed per-tier scheme. The OWNER's open cup does
 * not use this — see OWNER_CUP_CSS_VAR_PX / DiceCup's ResizeObserver-driven measured size. */
export const CUP_SIZE_PX: Record<SeatSize, number> = { large: 150, medium: 112, small: 84 };

/** The owner's open cup is sized responsively by CSS (`.dice-cup-owner-shell` in dice-cup.scss, a
 * `clamp()` between these two, so it can never shrink or grow outside a sane readable range) —
 * DiceCup measures the ACTUAL rendered size via ResizeObserver rather than duplicating the CSS
 * formula in TS, but needs a fallback for the first frame before that measurement lands. */
export const OWNER_CUP_FALLBACK_PX = 230;
export const OWNER_CUP_MIN_PX = 190;
export const OWNER_CUP_MAX_PX = 260;

/** Named CSS classes (defined in dice-cup.scss) for each visual layer — centralizes every color and
 * gradient reference so component markup never embeds one directly. */
export const DICE_CUP_CSS_CLASS = {
  ownerShell: 'dice-cup-owner-shell',
  openExterior: 'dice-cup-open-exterior',
  openInterior: 'dice-cup-open-interior',
  closed: 'dice-cup-closed',
} as const;

/** Collision radius as a fraction of the rendered die square's half-size — slightly smaller than
 * the visual square so dice can overlap a little without looking like they're clipping badly
 * *during the active shuffle only*. Final resting positions use the full die half-size instead
 * (see dice-layout.ts) so they never overlap once settled. */
export const DIE_COLLISION_RADIUS_RATIO = 0.42;

/** Visible gap enforced between dice in their final resting layout. */
export const DIE_GAP_PX = 10;

/** The usable inner bowl as a fraction of the cup's own radius — leaves room for the rim. */
export const INNER_BOWL_RATIO = { x: 0.82, y: 0.76 };

/** Phase duration ranges (ms) — a roll's actual total varies a little each time it plays, per
 * the "small natural variation between rolls" requirement. Chaotic ~900-1200ms, energy-loss +
 * settle together ~500-700ms of slowing down, total ~1.5-2.0s. */
export const PHASE_DURATION_MS = {
  chaotic: [950, 1200] as const,
  energyLoss: [275, 350] as const,
  settle: [275, 350] as const,
  /** The auto-deal "calm settle" after the opening roll — much shorter, no chaotic phase. */
  calmSettle: 450,
  /** The `prefers-reduced-motion` variant of a manual roll — a short, restrained settle instead
   * of the full chaotic shake, reusing the same 'settling' step logic with no preceding chaos. */
  reducedMotionSettle: 450,
};

export const PHYSICS_PROFILES = {
  chaotic: {
    damping: 0.9,
    wallRestitution: 0.72,
    wallFriction: 0.18,
    pairRestitution: 0.6,
    pairFriction: 0.22,
    maxSpeed: 1100,
  },
  energyLoss: {
    damping: 3,
    wallRestitution: 0.32,
    wallFriction: 0.4,
    pairRestitution: 0.3,
    pairFriction: 0.4,
    maxSpeed: 500,
  },
  settle: {
    damping: 6,
    wallRestitution: 0.1,
    wallFriction: 0.6,
    pairRestitution: 0.1,
    pairFriction: 0.6,
    maxSpeed: 220,
  },
  idle: {
    damping: 8,
    wallRestitution: 0.05,
    wallFriction: 0.7,
    pairRestitution: 0.05,
    pairFriction: 0.7,
    maxSpeed: 40,
  },
};

/** Random within [min, max]. */
export function randomInRange(
  [min, max]: readonly [number, number],
  random: () => number = Math.random,
): number {
  return min + random() * (max - min);
}
