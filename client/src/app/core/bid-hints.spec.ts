import { aceBid, buildBidScaleContext, normalBid, type BidRecord } from '@shared';
import { computeBidHints, describeBid, isInputLegal } from './bid-hints';

function context(...bids: BidRecord['bid'][]): ReturnType<typeof buildBidScaleContext> {
  return buildBidScaleContext(
    bids.map((bid) => ({ playerId: 'p', bid })),
    false,
  );
}

describe('bid hints (5.8)', () => {
  it('offers the aces switch from a normal bid, and none back from aces', () => {
    const hints = computeBidHints(context(normalBid(4, 5)));
    expect(hints.toAces).toEqual(aceBid(2));
    expect(hints.fromAces.every((h) => h.bid === null)).toBe(true);
  });

  it('applies the conditional sixes rule when leaving aces (5.4 example 3)', () => {
    const hints = computeBidHints(context(normalBid(4, 6), aceBid(2)));
    expect(hints.toAces).toBeNull();
    expect(hints.fromAces.find((h) => h.face === 6)?.bid).toEqual(normalBid(6, 6));
  });

  it('pre-validates free input with the shared validator (5.4 example 4)', () => {
    const ctx = context(normalBid(4, 5), aceBid(2));
    expect(isInputLegal(4, 4, ctx)).toBe(false);
    expect(isInputLegal(4, 6, ctx)).toBe(true);
    expect(isInputLegal(3, 1, ctx)).toBe(true);
  });

  it('describes bids for humans', () => {
    expect(describeBid(normalBid(3, 6))).toBe('3 × sixes');
    expect(describeBid(aceBid(1))).toBe('1 × ace');
  });
});
