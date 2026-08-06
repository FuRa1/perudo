/**
 * Client-only manifest of the non-dice illustration slots named in
 * designs/perudo-graphics-spec.dc.html (bg/table-surface, bg/cabin-lantern-glow,
 * cups/cup-open-top, cups/cup-closed-side, decor/token-frame, decor/badge-won,
 * decor/badge-lost). Dice art is out of scope here — DICE_FACES_CONFIG in `/shared` already owns
 * that swap (CLAUDE.md 3.5).
 *
 * No Scenario assets exist yet, so every `imageUrl` below is unset. Each slot already renders a
 * polished CSS-only fallback (never a broken `<img>`), documented in the `fallbackClass` comment
 * — grep for that class in styles.css / dice-cup.config.ts to find where it's applied. A future
 * task drops the generated file under `client/public/assets/...` and sets `imageUrl` here; no
 * component logic changes, the same way `Die` already swaps from CSS pips to `<img>` the moment
 * `DICE_FACES_CONFIG` gets a real `imageUrl` (client/src/app/ui/die/die.ts).
 *
 * This config is UI presentation only and must never move into `/shared` (CLAUDE.md 3.2).
 */

export interface VisualAssetSlot {
  /** Absolute or `/assets/...`-relative URL once Scenario art exists for this slot. */
  readonly imageUrl?: string;
}

export const VISUAL_ASSETS_CONFIG = {
  /** graphics-spec bg/table-surface-desktop.jpg + bg/table-surface-mobile.jpg.
   *  Fallback: `.table-surface` (styles.css) — the radial + plank-stripe gradient. */
  tableSurface: {},

  /** graphics-spec bg/cabin-lantern-glow.png — the breathing highlight over the active seat.
   *  Not rendered yet: this task's static/no-animation decision holds off the "breathe" motion
   *  the asset is meant to carry, so there is no CSS fallback to point at until that lands. */
  lanternGlow: {},

  /** graphics-spec cups/cup-open-top.png.
   *  Fallback: `.dice-cup-open-exterior` / `.dice-cup-open-interior` (styles.css, driven by
   *  dice-cup.config.ts's DICE_CUP_CSS_CLASS). */
  cupOpen: {},

  /** graphics-spec cups/cup-closed-side.png.
   *  Fallback: `.dice-cup-closed` (styles.css, driven by dice-cup.config.ts's DICE_CUP_CSS_CLASS). */
  cupClosed: {},

  /** graphics-spec decor/token-frame.png — the 9-slice cream-and-brass plate behind the wager
   *  token. Fallback: the bid-marker's own bordered-chip classes (ui/bid-marker/bid-marker.html). */
  bidMarkerFrame: {},

  /** graphics-spec decor/badge-won.png. Fallback: `.outcome-badge--won` (styles.css). */
  badgeWon: {},

  /** graphics-spec decor/badge-lost.png. Fallback: `.outcome-badge--loss` (styles.css). */
  badgeLost: {},
} satisfies Record<string, VisualAssetSlot>;

export type VisualAssetKey = keyof typeof VISUAL_ASSETS_CONFIG;
