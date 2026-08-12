import type { Bid } from '@shared/types/bid.types';
import type { DiceValue } from '@shared/types/dice.types';

/**
 * Whether a single die value counts toward a bid's claimed face, including wild aces unless a
 * special round is active (5.4, 5.5) — the one place this rule is expressed; `countClaimedFace`
 * below and any per-die presentation (e.g. ringing the matching dice at reveal) both filter on
 * this instead of re-deriving it.
 */
export function diceValueMatchesClaimedFace(
  value: DiceValue,
  bid: Bid,
  isSpecialRound: boolean,
): boolean {
  if (bid.kind === 'ACE') {
    return value === 1;
  }
  const acesAreWild = !isSpecialRound;
  return value === bid.face || (acesAreWild && value === 1);
}

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
  return dice.filter((value) => diceValueMatchesClaimedFace(value, bid, isSpecialRound)).length;
}
