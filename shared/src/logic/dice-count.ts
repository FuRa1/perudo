import type { Bid } from '../types/bid.types';
import type { DiceValue } from '../types/dice.types';

/**
 * Counts how many dice actually match a bid's claimed face, including wild aces unless a
 * special round is active (5.4, 5.5). Never used to generate dice — only to judge given values
 * (CLAUDE.md 4.3).
 */
export function countClaimedFace(
  dice: readonly DiceValue[],
  bid: Bid,
  isSpecialRound: boolean,
): number {
  if (bid.kind === 'ACE') {
    return dice.filter((value) => value === 1).length;
  }
  const acesAreWild = !isSpecialRound;
  return dice.filter((value) => value === bid.face || (acesAreWild && value === 1)).length;
}
