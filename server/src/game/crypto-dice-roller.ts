import { randomInt } from 'node:crypto';
import type { DiceRoller, DiceValue } from '@shared';

/** Production RNG (6.4) — crypto.randomInt, not Math.random(). Never called from game logic
 * directly; only handed to GameEngine as the injected DiceRoller. */
export class CryptoDiceRoller implements DiceRoller {
  roll(): DiceValue {
    return randomInt(1, 7) as DiceValue;
  }
}
