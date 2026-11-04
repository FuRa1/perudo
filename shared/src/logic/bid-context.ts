import type { BidScaleContext } from '@shared/logic/bid-scale';
import type { NormalBid } from '@shared/types/bid.types';
import type { BidRecord } from '@shared/types/state.types';

/** The most recent NORMAL-face bid of the round, which may be older than the last bid (5.4). */
export function lastNormalBidOf(bidHistory: readonly BidRecord[]): NormalBid | null {
  for (let i = bidHistory.length - 1; i >= 0; i -= 1) {
    const record = bidHistory[i] as BidRecord;
    if (record.bid.kind === 'NORMAL') {
      return record.bid;
    }
  }
  return null;
}

/**
 * Derives the validator context from a round's bid history. The single place this derivation
 * lives — the engine (authoritative check) and the client (pre-validation, 5.8) both call it,
 * so they can never disagree about what "the last normal bid" was.
 */
export function buildBidScaleContext(
  bidHistory: readonly BidRecord[],
  isSpecialRound: boolean,
): BidScaleContext {
  return {
    lastBid: bidHistory[bidHistory.length - 1]?.bid ?? null,
    lastNormalBid: lastNormalBidOf(bidHistory),
    isSpecialRound,
  };
}
