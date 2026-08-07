import type { SeatSize } from '../seat-card/seat-card';

/**
 * Everything visual/tunable about the (static) dice cup lives here — sizes, gaps. No cup color
 * or texture path is ever written directly into a component template; templates only reference
 * the CSS classes below (`DICE_CUP_CSS_CLASS`), which in turn reference the CSS custom
 * properties defined once in dice-cup.scss. A future texture-backed or 3D cup renderer only has to
 * replace those CSS values (or swap this whole component for another one implementing the same
 * SeatCard-facing input contract: dice/diceCount/isOwner) — nothing in match state or socket
 * logic has to change.
 */

/** Closed opponent-cup diameter in CSS pixels per SeatCard size tier — the closed cup has no
 * dice to lay out, so it stays on the simple fixed per-tier scheme. The OWNER's open cup does
 * not use this — see OWNER_CUP_FALLBACK_PX / DiceCup's ResizeObserver-driven measured size. */
export const CUP_SIZE_PX: Record<SeatSize, number> = { large: 150, medium: 112, small: 84 };

/** The owner's open cup is sized responsively by CSS (`.dice-cup-owner-shell` in dice-cup.scss, a
 * `clamp()` between these two, so it can never shrink or grow outside a sane readable range) —
 * DiceCup measures the ACTUAL rendered size via ResizeObserver rather than duplicating the CSS
 * formula in TS, but needs a fallback for the first frame before that measurement lands. */
export const OWNER_CUP_FALLBACK_PX = 230;

/** Named CSS classes (defined in dice-cup.scss) for each visual layer — centralizes every color
 * and gradient reference so component markup never embeds one directly. */
export const DICE_CUP_CSS_CLASS = {
  ownerShell: 'dice-cup-owner-shell',
  openExterior: 'dice-cup-open-exterior',
  openInterior: 'dice-cup-open-interior',
  closed: 'dice-cup-closed',
} as const;

/** Visible gap enforced between dice in their resting layout. */
export const DIE_GAP_PX = 10;

/** The usable inner bowl as a fraction of the cup's own radius — leaves room for the rim. */
export const INNER_BOWL_RATIO = { x: 0.82, y: 0.76 };
