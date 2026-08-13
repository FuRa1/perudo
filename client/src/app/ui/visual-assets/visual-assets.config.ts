/**
 * Client-only manifest of illustration slots named in designs/perudo-graphics-spec.dc.html
 * (bg/table-surface × breakpoint, bg/lobby-header-band, bg/cabin-lantern-glow, cups/cup-open-top,
 * cups/cup-closed-side, decor/token-frame, decor/badge-won, decor/badge-lost) plus the dice
 * sprite sheet (designs/assets/dice/dice-sprite.png, .dc.html). The sprite is registered here
 * rather than in `DICE_FACES_CONFIG` (`/shared`): that config models one static image per face
 * (`imageUrl`, still unset/CSS-pips-only — untouched by this manifest) and stays the swap point
 * for per-face art; the sprite sheet is a single strip addressed by `background-position`, an
 * unrelated rendering strategy that Step 4 wires into `app-die` as a client-only concern, same as
 * everything else in this file (CLAUDE.md 3.2 — this config must never move into `/shared`).
 *
 * Runtime files now exist under `client/public/assets/...` (copied verbatim from
 * `designs/assets/...`), so every slot below is populated. Each slot's CSS-only fallback —
 * documented per-entry with the component .scss file that owns it (theme/_mixins.scss holds the
 * shared building blocks) — stays in place; nothing here removes a fallback, only adds the real
 * `imageUrl` a component can choose to prefer.
 */

export interface VisualAssetSlot {
  /** Absolute or `/assets/...`-relative URL once art exists for this slot. */
  readonly imageUrl?: string;
}

export const VISUAL_ASSETS_CONFIG = {
  /** graphics-spec bg/table-surface-desktop.jpg, at the desktop breakpoint (design-kit board,
   *  ~1440–2879px). Fallback: `.table-surface` (features/table/table.scss) — the radial +
   *  plank-stripe gradient. */
  tableSurfaceDesktop: { imageUrl: '/assets/bg/table-desktop-2880x1800.png' },

  /** graphics-spec bg/table-surface-desktop.jpg, ultrawide variant (~2880px+ / wide aspect).
   *  Same fallback as `tableSurfaceDesktop`. */
  tableSurfaceUltrawide: { imageUrl: '/assets/bg/table-ultrawide-3440x1440.png' },

  /** graphics-spec bg/table-surface-desktop.jpg, tablet-landscape variant (~768–1439px, wide).
   *  Same fallback as `tableSurfaceDesktop`. */
  tableSurfaceTabletLandscape: { imageUrl: '/assets/bg/table-tablet-landscape-2360x1640.png' },

  /** graphics-spec bg/table-surface-mobile.jpg, tablet-portrait variant (~768–1439px, tall).
   *  Same fallback as `tableSurfaceDesktop`. */
  tableSurfaceTabletPortrait: { imageUrl: '/assets/bg/table-tablet-portrait-1640x2360.png' },

  /** graphics-spec bg/table-surface-mobile.jpg, phone-portrait variant (<768px).
   *  Same fallback as `tableSurfaceDesktop`. */
  tableSurfaceMobile: { imageUrl: '/assets/bg/table-mobile-1170x2532.png' },

  /** graphics-spec bg/lobby-header-band.jpg — the lobby screen's own header band, distinct from
   *  the on-table surfaces above. Fallback: `.lobby-surface` (features/lobby/lobby.scss). */
  lobbyHeader: { imageUrl: '/assets/bg/lobby-header-band-2880x260.png' },

  /** graphics-spec bg/cabin-lantern-glow.png — the breathing highlight over the active seat.
   *  Not rendered yet: this task's static/no-animation decision holds off the "breathe" motion
   *  the asset is meant to carry, so there is no CSS fallback to point at until that lands. No
   *  runtime file has been supplied for this slot either. */
  lanternGlow: {},

  /** graphics-spec cups/cup-open-top.png.
   *  Fallback: `.dice-cup-open-exterior` / `.dice-cup-open-interior` (ui/dice-cup/dice-cup.scss,
   *  driven by dice-cup.config.ts's DICE_CUP_CSS_CLASS). */
  cupOpen: { imageUrl: '/assets/cups/cup-open-top.png' },

  /** graphics-spec cups/cup-closed-side.png.
   *  Fallback: `.dice-cup-closed` (ui/dice-cup/dice-cup.scss, driven by dice-cup.config.ts's
   *  DICE_CUP_CSS_CLASS). */
  cupClosed: { imageUrl: '/assets/cups/cup-closed-side.png' },

  /** graphics-spec decor/token-frame.png — a 9-slice cream-and-brass plate, listed here as a
   *  future swap-in point but not currently consumed by `BidMarker` (ui/bid-marker/bid-marker.scss
   *  uses only its own bordered-gradient chip). A prior version painted this asset directly as a
   *  `background-image` at `background-size: contain` instead of a true 9-slice `border-image` —
   *  since the asset itself is round and the chip is a wide, short pill, `contain` sizing painted
   *  a visible circular ring/rivet texture the reference (mobile-lantern.dc.html,
   *  perudo-design-kit.dc.html §4) doesn't have. Re-integrating this slot correctly would need a
   *  real `border-image`/9-slice treatment, not a straight swap back to `background-image`. */
  bidMarkerFrame: { imageUrl: '/assets/decor/token-frame.png' },

  /** graphics-spec decor/badge-won.png. Fallback: the `outcome-badge('won')` mixin
   *  (theme/_mixins.scss), applied by features/winner/winner.scss. */
  badgeWon: { imageUrl: '/assets/decor/badge-won.png' },

  /** graphics-spec decor/badge-lost.png. Fallback: the `outcome-badge('loss')` mixin
   *  (theme/_mixins.scss), applied by features/round-loss-modal/round-loss-modal.scss. */
  badgeLost: { imageUrl: '/assets/decor/badge-lost.png' },

  /** designs/assets/dice/dice-sprite.png — 312×52, six 52px frames (see dice-sprite-sheet.dc.html
   *  for the offset table). Standard-density source; `diceSprite2x` is the same strip at 2x pixel
   *  density for high-DPI displays, selected at the same fixed `background-size`. Fallback: the
   *  `Die` component's existing CSS pip renderer (ui/die/die.ts / die.html). */
  diceSprite: { imageUrl: '/assets/dice/dice-sprite.png' },

  /** High-DPI companion to `diceSprite` (624×104, same 6-frame layout at 2x). */
  diceSprite2x: { imageUrl: '/assets/dice/dice-sprite-2x.png' },
} satisfies Record<string, VisualAssetSlot>;

export type VisualAssetKey = keyof typeof VISUAL_ASSETS_CONFIG;
