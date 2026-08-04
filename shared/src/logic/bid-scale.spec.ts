import { aceBid, normalBid } from '@shared/types/bid.types';
import type { NormalBid } from '@shared/types/bid.types';
import {
  cheapestLegalBid,
  isLegalBid,
  minimumAceQuantity,
  minimumAceSwitchBid,
  minimumNormalQuantityFromAces,
  minimumNormalSwitchBid,
} from './bid-scale';
import type { BidScaleContext } from './bid-scale';

function contextAfter(
  lastBid: BidScaleContext['lastBid'],
  lastNormalBid: NormalBid | null = null,
): BidScaleContext {
  return { lastBid, lastNormalBid, isSpecialRound: false };
}

describe('minimumAceQuantity (5.4, normal face -> aces)', () => {
  it('is ceil(normal_quantity / 2)', () => {
    expect(minimumAceQuantity(4)).toBe(2);
    expect(minimumAceQuantity(5)).toBe(3);
    expect(minimumAceQuantity(1)).toBe(1);
  });
});

describe('the 4 worked examples from CLAUDE.md 5.4 (authoritative)', () => {
  it('1. 4 fours -> 2 aces -> 4 fives is legal (same quantity, higher face)', () => {
    const context = contextAfter(aceBid(2), normalBid(4, 4));
    expect(isLegalBid(normalBid(4, 5), context)).toBe(true);
  });

  it('2. 3 sixes -> 2 aces -> 4 sixes is legal (base has not occurred, no bump)', () => {
    const context = contextAfter(aceBid(2), normalBid(3, 6));
    expect(isLegalBid(normalBid(4, 6), context)).toBe(true);
    expect(minimumNormalSwitchBid(context, 6)).toEqual(normalBid(4, 6));
  });

  it('3. 4 sixes -> 2 aces -> base 4 sixes collides, so 6 sixes is required (the sixes bump)', () => {
    const context = contextAfter(aceBid(2), normalBid(4, 6));
    expect(isLegalBid(normalBid(4, 6), context)).toBe(false);
    expect(isLegalBid(normalBid(6, 6), context)).toBe(true);
    expect(minimumNormalQuantityFromAces(2, 6, normalBid(4, 6))).toBe(6);
    expect(minimumNormalSwitchBid(context, 6)).toEqual(normalBid(6, 6));
  });

  it('4. 4 fives -> 2 aces -> anything below six at quantity 4 is forbidden; 4 sixes is fine if unused', () => {
    const context = contextAfter(aceBid(2), normalBid(4, 5));
    expect(isLegalBid(normalBid(4, 2), context)).toBe(false);
    expect(isLegalBid(normalBid(4, 3), context)).toBe(false);
    expect(isLegalBid(normalBid(4, 4), context)).toBe(false);
    expect(isLegalBid(normalBid(4, 5), context)).toBe(false); // exact repeat
    expect(isLegalBid(normalBid(4, 6), context)).toBe(true);
  });
});

describe('first bid of a round (5.3)', () => {
  const context: BidScaleContext = { lastBid: null, lastNormalBid: null, isSpecialRound: false };

  it('allows any face, including aces, at any quantity >= 1', () => {
    expect(isLegalBid(normalBid(1, 2), context)).toBe(true);
    expect(isLegalBid(normalBid(1, 6), context)).toBe(true);
    expect(isLegalBid(aceBid(1), context)).toBe(true);
    expect(isLegalBid(aceBid(10), context)).toBe(true);
  });

  it('rejects a quantity below the minimum of 1', () => {
    expect(isLegalBid(normalBid(0, 3), context)).toBe(false);
  });
});

describe('normal-to-normal raises (no aces involved)', () => {
  it('a strictly higher quantity is always legal, regardless of face', () => {
    const context = contextAfter(normalBid(5, 6));
    expect(isLegalBid(normalBid(6, 2), context)).toBe(true);
  });

  it('the same quantity requires a strictly higher face', () => {
    const context = contextAfter(normalBid(4, 3));
    expect(isLegalBid(normalBid(4, 4), context)).toBe(true);
    expect(isLegalBid(normalBid(4, 3), context)).toBe(false);
    expect(isLegalBid(normalBid(4, 2), context)).toBe(false);
  });

  it('six is the ceiling — only a higher quantity can raise over a six bid', () => {
    const context = contextAfter(normalBid(4, 6));
    expect(isLegalBid(normalBid(4, 6), context)).toBe(false);
    expect(isLegalBid(normalBid(5, 2), context)).toBe(true);
  });

  it('a lower quantity is never legal', () => {
    const context = contextAfter(normalBid(4, 3));
    expect(isLegalBid(normalBid(3, 6), context)).toBe(false);
  });
});

describe('aces-to-aces raises', () => {
  it('requires a strictly higher quantity', () => {
    const context = contextAfter(aceBid(3));
    expect(isLegalBid(aceBid(4), context)).toBe(true);
    expect(isLegalBid(aceBid(3), context)).toBe(false);
    expect(isLegalBid(aceBid(2), context)).toBe(false);
  });
});

describe('switching normal -> aces', () => {
  it('requires at least the minimum aces quantity, but allows more', () => {
    const context = contextAfter(normalBid(5, 4));
    expect(isLegalBid(aceBid(2), context)).toBe(false); // ceil(5/2) = 3
    expect(isLegalBid(aceBid(3), context)).toBe(true);
    expect(isLegalBid(aceBid(4), context)).toBe(true);
  });
});

describe('5.8 hints', () => {
  it('cheapestLegalBid raises the same face/kind by the smallest step', () => {
    expect(cheapestLegalBid({ lastBid: null, lastNormalBid: null, isSpecialRound: false })).toEqual(
      normalBid(1, 2),
    );
    expect(cheapestLegalBid(contextAfter(normalBid(4, 3)))).toEqual(normalBid(5, 3));
    expect(cheapestLegalBid(contextAfter(aceBid(2)))).toEqual(aceBid(3));
  });

  it('minimumAceSwitchBid is null when there is no normal bid to convert from', () => {
    expect(
      minimumAceSwitchBid({ lastBid: null, lastNormalBid: null, isSpecialRound: false }),
    ).toBeNull();
    expect(minimumAceSwitchBid(contextAfter(aceBid(2)))).toBeNull();
    expect(minimumAceSwitchBid(contextAfter(normalBid(4, 3), normalBid(4, 3)))).toEqual(aceBid(2));
  });

  it('minimumNormalSwitchBid is null when the last bid is not on aces', () => {
    expect(
      minimumNormalSwitchBid({ lastBid: null, lastNormalBid: null, isSpecialRound: false }, 4),
    ).toBeNull();
    expect(minimumNormalSwitchBid(contextAfter(normalBid(4, 3)), 4)).toBeNull();
  });

  it('every hint it returns is itself a legal bid, across the worked-example contexts', () => {
    const contexts: BidScaleContext[] = [
      contextAfter(aceBid(2), normalBid(4, 4)),
      contextAfter(aceBid(2), normalBid(3, 6)),
      contextAfter(aceBid(2), normalBid(4, 6)),
      contextAfter(aceBid(2), normalBid(4, 5)),
      contextAfter(normalBid(5, 4)),
      contextAfter(normalBid(4, 3)),
    ];
    for (const context of contexts) {
      expect(isLegalBid(cheapestLegalBid(context), context)).toBe(true);
      const aceSwitch = minimumAceSwitchBid(context);
      if (aceSwitch) {
        expect(isLegalBid(aceSwitch, context)).toBe(true);
      }
      for (const face of [2, 3, 4, 5, 6] as const) {
        const normalSwitch = minimumNormalSwitchBid(context, face);
        if (normalSwitch) {
          expect(isLegalBid(normalSwitch, context)).toBe(true);
        }
      }
    }
  });
});

describe('special round (5.5) — aces not wild, face is fixed, quantity-only raises', () => {
  it('rejects a face change even if it would otherwise be a legal raise', () => {
    const context: BidScaleContext = {
      lastBid: normalBid(4, 3),
      lastNormalBid: normalBid(4, 3),
      isSpecialRound: true,
    };
    expect(isLegalBid(normalBid(4, 4), context)).toBe(false);
    expect(isLegalBid(normalBid(5, 4), context)).toBe(false);
  });

  it('accepts a strictly higher quantity on the same face', () => {
    const context: BidScaleContext = {
      lastBid: normalBid(4, 3),
      lastNormalBid: normalBid(4, 3),
      isSpecialRound: true,
    };
    expect(isLegalBid(normalBid(5, 3), context)).toBe(true);
    expect(isLegalBid(normalBid(4, 3), context)).toBe(false);
  });

  it('also fixes aces as a normal (non-wild) face if that was the opening bid', () => {
    const context: BidScaleContext = {
      lastBid: aceBid(2),
      lastNormalBid: null,
      isSpecialRound: true,
    };
    expect(isLegalBid(aceBid(3), context)).toBe(true);
    expect(isLegalBid(normalBid(6, 4), context)).toBe(false);
  });
});
