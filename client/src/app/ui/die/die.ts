import { Component, computed, input } from '@angular/core';
import { DICE_FACES_CONFIG, type DiceFaceVisual, type DiceValue } from '@shared';

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

/**
 * Renders a single die face entirely from DICE_FACES_CONFIG (3.4, 8.2) — CSS pips today, an
 * `<img>` automatically once a face gets a real `imageUrl` (3.5: rendering is swappable, no
 * component changes needed when Phase 4's art integration happens).
 *
 * `rolling` shows a short CSS-only spin instead of the face — a purely cosmetic cue (8.2: "no
 * pseudo-hints in the animation"). It never stands in for a result: `value` is ignored while
 * `rolling` is true, and the real face only ever appears once the server has actually sent it.
 */
@Component({
  selector: 'app-die',
  standalone: true,
  templateUrl: './die.html',
})
export class Die {
  readonly value = input.required<DiceValue>();
  readonly rolling = input(false);

  protected readonly face = computed(() => FACE_BY_VALUE[this.value()]);
  protected readonly pips = computed(() => PIP_LAYOUTS[this.value()]);
}
