import { aceBid, normalBid } from '@shared/types/bid.types';
import type { BidRecord } from '@shared/types/state.types';
import { buildBidScaleContext, lastNormalBidOf } from './bid-context';

function records(...bids: BidRecord['bid'][]): BidRecord[] {
  return bids.map((bid, index) => ({ playerId: `p${index}`, bid }));
}

describe('buildBidScaleContext', () => {
  it('is empty before the first bid', () => {
    expect(buildBidScaleContext([], false)).toEqual({
      lastBid: null,
      lastNormalBid: null,
      isSpecialRound: false,
    });
  });

  it('remembers the normal bid that preceded an aces streak', () => {
    const history = records(normalBid(4, 5), aceBid(2), aceBid(3));
    const context = buildBidScaleContext(history, false);
    expect(context.lastBid).toEqual(aceBid(3));
    expect(context.lastNormalBid).toEqual(normalBid(4, 5));
  });

  it('passes the special-round flag through', () => {
    expect(buildBidScaleContext(records(normalBid(1, 3)), true).isSpecialRound).toBe(true);
  });
});

describe('lastNormalBidOf', () => {
  it('returns null for an aces-only history', () => {
    expect(lastNormalBidOf(records(aceBid(1), aceBid(2)))).toBeNull();
  });
});
