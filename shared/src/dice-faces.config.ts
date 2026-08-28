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
  /** Client-relative `/assets/...` URL once real 2D art exists for this face — the `Die`
   * component (client) prefers this over the dice-sprite sheet, which itself is preferred over
   * CSS pips (see ui/die/die.ts's own doc comment for the full fallback order). Populated from
   * the real Scenario-generated art already integrated under `client/public/assets/dice/`
   * (Phase 4) — six standard pips on the six face, no skull or other substitute glyph (8.2). */
  readonly imageUrl?: string;
}

export const DICE_FACES_CONFIG: readonly DiceFaceVisual[] = [
  { value: 1, label: 'Ace', isAce: true, imageUrl: '/assets/dice/die-face-1.png' },
  { value: 2, label: 'Two', isAce: false, imageUrl: '/assets/dice/die-face-2.png' },
  { value: 3, label: 'Three', isAce: false, imageUrl: '/assets/dice/die-face-3.png' },
  { value: 4, label: 'Four', isAce: false, imageUrl: '/assets/dice/die-face-4.png' },
  { value: 5, label: 'Five', isAce: false, imageUrl: '/assets/dice/die-face-5.png' },
  { value: 6, label: 'Six', isAce: false, imageUrl: '/assets/dice/die-face-6.png' },
];
