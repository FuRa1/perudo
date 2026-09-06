import {
  ARC_TOP_PADDING_PX,
  CARD_GAP_PX,
  computeArcPosition,
  computeRingPosition,
  seatSizeFor,
} from './seat-geometry';

describe('seat-geometry', () => {
  describe('seatSizeFor', () => {
    it('is large at 4 or fewer opponents', () => {
      expect(seatSizeFor(0)).toBe('large');
      expect(seatSizeFor(4)).toBe('large');
    });

    it('is medium from 5 to 7 opponents', () => {
      expect(seatSizeFor(5)).toBe('medium');
      expect(seatSizeFor(7)).toBe('medium');
    });

    it('is small at 8 or more opponents', () => {
      expect(seatSizeFor(8)).toBe('small');
      expect(seatSizeFor(11)).toBe('small');
    });
  });

  describe('computeArcPosition', () => {
    it('centers a single opponent near the top', () => {
      expect(computeArcPosition(0, 1)).toEqual({ left: '50%', top: '18%' });
    });

    it('spreads the first and last opponents to the outer margins', () => {
      const first = computeArcPosition(0, 3);
      const last = computeArcPosition(2, 3);
      expect(first.left).toBe('10%');
      expect(last.left).toBe('90%');
    });

    it('raises the middle opponent above the outer ones (the sine arch peaks in the middle)', () => {
      const outer = computeArcPosition(0, 3);
      const middle = computeArcPosition(1, 3);
      expect(parseFloat(middle.top)).toBeLessThan(parseFloat(outer.top));
    });
  });

  describe('computeRingPosition', () => {
    it('centers a single opponent near the top, same as the arc', () => {
      expect(computeRingPosition(0, 1)).toEqual({ left: '50%', top: '18%' });
    });

    it('places seat 0 at the top of the ring', () => {
      const pos = computeRingPosition(0, 4);
      expect(parseFloat(pos.left)).toBeCloseTo(50, 0);
      expect(parseFloat(pos.top)).toBeLessThan(50);
    });

    it('distributes seats around the full ellipse, not clustered on one side', () => {
      const lefts = [0, 1, 2, 3].map((i) => parseFloat(computeRingPosition(i, 4).left));
      expect(Math.max(...lefts) - Math.min(...lefts)).toBeGreaterThan(50);
    });
  });

  it('exports the geometry constants used by the desktop/tablet arc', () => {
    expect(ARC_TOP_PADDING_PX).toBe(140);
    expect(CARD_GAP_PX).toBe(12);
  });
});
