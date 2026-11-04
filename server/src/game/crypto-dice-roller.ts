import { randomInt } from 'node:crypto';
import type { DiceRoller, DiceValue } from '@shared';

/** DI token for the engine's dice source (6.4) — tests swap in a SequenceDiceRoller. */
export const DICE_ROLLER = Symbol('DICE_ROLLER');

const MIN_FACE = 1;
const MAX_FACE_EXCLUSIVE = 7;

/** Production roller: crypto.randomInt is uniform with no modulo bias (CLAUDE.md 6.4). */
export class CryptoDiceRoller implements DiceRoller {
  roll(): DiceValue {
    return randomInt(MIN_FACE, MAX_FACE_EXCLUSIVE) as DiceValue;
  }
}
