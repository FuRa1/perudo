import type { RoundOutcome } from '@shared/types/round.types';

/**
 * actual >= claimed → the caller ("liar") loses; actual < claimed → the bidder loses. An exact
 * match is a caller loss too — there is no "spot on" bonus (5.3).
 */
export function determineLiarOutcome(
  actualQuantity: number,
  claimedQuantity: number,
): RoundOutcome {
  return actualQuantity >= claimedQuantity ? 'CALLER_LOSES' : 'BIDDER_LOSES';
}
