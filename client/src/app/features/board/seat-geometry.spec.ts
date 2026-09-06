import {
  ARC_TOP_PADDING_PX,
  CARD_GAP_PX,
  computeArcPosition,
  computeRingPosition,
  ringRadiusPercent,
  ringSeatOpacity,
  ringSeatSizePx,
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

    it('places the first and last seats near the bottom, flanking the reserved gap', () => {
      const first = computeRingPosition(0, 5);
      const last = computeRingPosition(4, 5);
      expect(parseFloat(first.top)).toBeGreaterThan(50);
      expect(parseFloat(last.top)).toBeGreaterThan(50);
      // One flanks the gap from the left, the other from the right.
      expect(Math.sign(parseFloat(first.left) - 50)).not.toBe(
        Math.sign(parseFloat(last.left) - 50),
      );
    });

    it('places a middle seat near the top, opposite the gap', () => {
      const middle = computeRingPosition(2, 5);
      expect(parseFloat(middle.top)).toBeLessThan(50);
    });

    it('distributes seats around most of the ellipse, not clustered on one side', () => {
      const lefts = [0, 1, 2, 3, 4].map((i) => parseFloat(computeRingPosition(i, 5).left));
      expect(Math.max(...lefts) - Math.min(...lefts)).toBeGreaterThan(50);
    });

    it('never places two seats at the exact same position for a distinct index/count pair', () => {
      const positions = Array.from({ length: 8 }, (_, i) => computeRingPosition(i, 8));
      const unique = new Set(positions.map((p) => `${p.left},${p.top}`));
      expect(unique.size).toBe(8);
    });
  });

  describe('ringRadiusPercent (Decision 7: continuous, not breakpointed)', () => {
    it('is smallest at the light-table endpoint', () => {
      const { rx, ry } = ringRadiusPercent(3);
      expect(rx).toBeCloseTo(44, 5);
      expect(ry).toBeCloseTo(30, 5);
    });

    it('is largest at the full-table endpoint', () => {
      const { rx, ry } = ringRadiusPercent(11);
      expect(rx).toBeCloseTo(48, 5);
      expect(ry).toBeCloseTo(35, 5);
    });

    it('interpolates strictly between the two endpoints for a mid-sized table', () => {
      const { rx } = ringRadiusPercent(7);
      expect(rx).toBeGreaterThan(44);
      expect(rx).toBeLessThan(48);
    });

    it('clamps rather than extrapolating past either endpoint', () => {
      expect(ringRadiusPercent(1)).toEqual(ringRadiusPercent(3));
      expect(ringRadiusPercent(20)).toEqual(ringRadiusPercent(11));
    });
  });

  describe('ringSeatSizePx', () => {
    it('is 44px at the light-table endpoint and 34px at the full-table endpoint', () => {
      expect(ringSeatSizePx(3)).toBe(44);
      expect(ringSeatSizePx(11)).toBe(34);
    });

    it('eases monotonically between the two endpoints', () => {
      expect(ringSeatSizePx(7)).toBeLessThan(44);
      expect(ringSeatSizePx(7)).toBeGreaterThan(34);
    });

    it('never shrinks below the 30px floor beyond the reference table size', () => {
      expect(ringSeatSizePx(20)).toBeGreaterThanOrEqual(30);
    });
  });

  describe('ringSeatOpacity', () => {
    it('dims only the last seat to .55 at a small table with no room to taper', () => {
      expect(ringSeatOpacity(0, 3)).toBeCloseTo(0.55, 5);
    });

    it('leaves every seat but the last two at full opacity', () => {
      expect(ringSeatOpacity(2, 11)).toBe(1);
      expect(ringSeatOpacity(5, 11)).toBe(1);
    });

    it('never dims a 2-or-fewer-opponent ring at all', () => {
      expect(ringSeatOpacity(0, 2)).toBe(1);
      expect(ringSeatOpacity(0, 1)).toBe(1);
    });
  });

  it('exports the geometry constants used by the desktop/tablet arc', () => {
    expect(ARC_TOP_PADDING_PX).toBe(140);
    expect(CARD_GAP_PX).toBe(12);
  });
});
