import type { DiceRoller, DiceValue } from '../types/dice.types';

/**
 * Deterministic {@link DiceRoller} for tests — returns a fixed sequence, then repeats the last
 * value if exhausted. Never used in production (6.4); the crypto-based roller lives in /server.
 */
export class SequenceDiceRoller implements DiceRoller {
  private index = 0;

  constructor(private readonly sequence: readonly DiceValue[]) {}

  roll(): DiceValue {
    if (this.sequence.length === 0) {
      throw new Error('SequenceDiceRoller.roll() called with an empty sequence');
    }
    const value = this.sequence[Math.min(this.index, this.sequence.length - 1)] as DiceValue;
    this.index += 1;
    return value;
  }
}
