import type { DiceValue } from '@shared/types/dice.types';

/**
 * The dice-face structure as data (3.4, 8.2) — rendering reads this instead of hardcoding
 * per-face behavior, so integrating real art later (filling in `imageUrl`) needs no component
 * changes (3.5, Phase 4 "Don't miss": visuals come from the config, rendering is swappable).
 */
export interface DiceFaceVisual {
  readonly value: DiceValue;
  readonly label: string;
  /** The wild ace face by default (5.4) — descriptive here, not itself game logic. */
  readonly isAce: boolean;
  /** Six gets a small skull instead of its sixth pip (8.2). */
  readonly usesSkull: boolean;
  /** Unset until real 2D art (Scenario) is integrated — renderers fall back to CSS pips. */
  readonly imageUrl?: string;
}

export const DICE_FACES_CONFIG: readonly DiceFaceVisual[] = [
  { value: 1, label: 'Ace', isAce: true, usesSkull: false },
  { value: 2, label: 'Two', isAce: false, usesSkull: false },
  { value: 3, label: 'Three', isAce: false, usesSkull: false },
  { value: 4, label: 'Four', isAce: false, usesSkull: false },
  { value: 5, label: 'Five', isAce: false, usesSkull: false },
  { value: 6, label: 'Six', isAce: false, usesSkull: true },
];
