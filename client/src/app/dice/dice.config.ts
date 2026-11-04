import type { DiceValue } from '@shared';

/** A pip slot on a 3×3 grid: row and column, 1-based. */
export interface PipSlot {
  readonly row: 1 | 2 | 3;
  readonly col: 1 | 2 | 3;
}

export interface DieFaceConfig {
  readonly value: DiceValue;
  readonly label: string;
  readonly pips: readonly PipSlot[];
  /** Grid slot drawn as a skull instead of a pip (8.2: the six carries a small skull). */
  readonly skull: PipSlot | null;
}

const TL: PipSlot = { row: 1, col: 1 };
const TR: PipSlot = { row: 1, col: 3 };
const ML: PipSlot = { row: 2, col: 1 };
const MC: PipSlot = { row: 2, col: 2 };
const MR: PipSlot = { row: 2, col: 3 };
const BL: PipSlot = { row: 3, col: 1 };
const BR: PipSlot = { row: 3, col: 3 };

/**
 * The dice structure as data (CLAUDE.md 8.2, 3.5). The die component only draws what this says,
 * so Phase 4 art (or a 3D renderer later) replaces the visuals without touching game code.
 */
export const DICE_FACES: Readonly<Record<DiceValue, DieFaceConfig>> = {
  1: { value: 1, label: 'Ace', pips: [MC], skull: null },
  2: { value: 2, label: 'Two', pips: [TR, BL], skull: null },
  3: { value: 3, label: 'Three', pips: [TR, MC, BL], skull: null },
  4: { value: 4, label: 'Four', pips: [TL, TR, BL, BR], skull: null },
  5: { value: 5, label: 'Five', pips: [TL, TR, MC, BL, BR], skull: null },
  6: { value: 6, label: 'Six', pips: [TL, TR, ML, BL, BR], skull: MR },
};
