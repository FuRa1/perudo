import { determineLiarOutcome } from './round-outcome';

describe('determineLiarOutcome (5.3)', () => {
  it('the caller loses when the actual quantity exceeds the claim', () => {
    expect(determineLiarOutcome(5, 4)).toBe('CALLER_LOSES');
  });

  it('the caller loses on an exact match — no "spot on" bonus', () => {
    expect(determineLiarOutcome(4, 4)).toBe('CALLER_LOSES');
  });

  it('the bidder loses when the actual quantity is below the claim', () => {
    expect(determineLiarOutcome(3, 4)).toBe('BIDDER_LOSES');
  });
});
