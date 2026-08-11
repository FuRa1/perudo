import { Component, computed, input } from '@angular/core';
import { DICE_FACES_CONFIG, type DiceFaceVisual, type DiceValue } from '@shared';
import { VISUAL_ASSETS_CONFIG } from '../visual-assets/visual-assets.config';

interface PipCell {
  readonly row: 1 | 2 | 3;
  readonly col: 1 | 2 | 3;
}

// Classic 6-sided pip layout on a 3x3 grid (8.2).
const PIP_LAYOUTS: Record<DiceValue, readonly PipCell[]> = {
  1: [{ row: 2, col: 2 }],
  2: [
    { row: 1, col: 3 },
    { row: 3, col: 1 },
  ],
  3: [
    { row: 1, col: 3 },
    { row: 2, col: 2 },
    { row: 3, col: 1 },
  ],
  4: [
    { row: 1, col: 1 },
    { row: 1, col: 3 },
    { row: 3, col: 1 },
    { row: 3, col: 3 },
  ],
  5: [
    { row: 1, col: 1 },
    { row: 1, col: 3 },
    { row: 2, col: 2 },
    { row: 3, col: 1 },
    { row: 3, col: 3 },
  ],
  6: [
    { row: 1, col: 1 },
    { row: 2, col: 1 },
    { row: 3, col: 1 },
    { row: 1, col: 3 },
    { row: 2, col: 3 },
    { row: 3, col: 3 },
  ],
};

// DICE_FACES_CONFIG has exactly one entry per DiceValue (dice-faces.config.spec.ts asserts it).
const FACE_BY_VALUE = Object.fromEntries(DICE_FACES_CONFIG.map((f) => [f.value, f])) as Record<
  DiceValue,
  DiceFaceVisual
>;

// designs/assets/dice/dice-sprite.png: six 52px frames in one 312×52 strip, addressed by
// `background-position-x`. Expressed as percentages (not the sprite sheet's literal 0/-52/.../
// -260px) so the frame window scales with however big this particular `<app-die>` is rendered —
// table dice, the bid-picker's larger die, and the fluid clamp()-sized opening-roll/bid-marker
// dice all reuse this one component at very different box sizes. `background-size: 600% 100%`
// (die.scss) stretches the whole strip to 6x the die's own box width, so each 1/6-width step is
// exactly one frame — same "nothing but position changes" contract, just resolution-independent.
const SPRITE_POSITION_X_PERCENT: Record<DiceValue, string> = {
  1: '0%',
  2: '20%',
  3: '40%',
  4: '60%',
  5: '80%',
  6: '100%',
};

/**
 * Renders a single die face entirely from DICE_FACES_CONFIG (3.4, 8.2) plus the client-only
 * VISUAL_ASSETS_CONFIG.diceSprite manifest (3.5, 8.2) — CSS pips by default, preferring in order:
 * 1. a per-face `imageUrl` on DICE_FACES_CONFIG itself (still unset today — untouched by this
 *    integration, kept as the most specific override point for future real per-face art);
 * 2. the sprite sheet, whenever VISUAL_ASSETS_CONFIG.diceSprite.imageUrl is populated;
 * 3. CSS pips, if neither of the above is configured — the original renderer, unchanged.
 * No component changes are needed to move between these tiers (3.5).
 */
@Component({
  selector: 'app-die',
  standalone: true,
  templateUrl: './die.html',
  styleUrl: './die.scss',
})
export class Die {
  readonly value = input.required<DiceValue>();

  protected readonly face = computed(() => FACE_BY_VALUE[this.value()]);
  protected readonly pips = computed(() => PIP_LAYOUTS[this.value()]);
  protected readonly isSpriteEnabled = !!VISUAL_ASSETS_CONFIG.diceSprite.imageUrl;
  protected readonly spritePositionX = computed(() => SPRITE_POSITION_X_PERCENT[this.value()]);
}
