import { aceBid, normalBid } from '@shared/types/bid.types';
import type { DiceValue } from '@shared/types/dice.types';
import { countClaimedFace } from './dice-count';

const dice: DiceValue[] = [1, 3, 3, 5, 1, 6];

describe('countClaimedFace', () => {
  it('counts exact matches plus wild aces for a normal face, when aces are wild', () => {
    expect(countClaimedFace(dice, normalBid(1, 3), false)).toBe(4); // 2 threes + 2 aces
  });

  it('counts only exact matches for a normal face when aces are NOT wild (special round)', () => {
    expect(countClaimedFace(dice, normalBid(1, 3), true)).toBe(2); // just the two threes
  });

  it('counts aces themselves when the bid claims aces, regardless of wild setting', () => {
    expect(countClaimedFace(dice, aceBid(1), false)).toBe(2);
    expect(countClaimedFace(dice, aceBid(1), true)).toBe(2);
  });

  it('returns 0 when nothing matches', () => {
    expect(countClaimedFace(dice, normalBid(1, 2), true)).toBe(0);
  });
});
