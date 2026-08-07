import { computeFinalLayout, type CupBounds } from './dice-layout';

// Generous bowl relative to a small die — the "normal" case where the ideal spacing fits
// comfortably, so tests can assert exact minimum-separation guarantees.
const ROOMY_BOUNDS: CupBounds = { radiusX: 120, radiusY: 100 };
const DIE_HALF_SIZE = 24;
const GAP = 10;
const MIN_SEPARATION = 2 * DIE_HALF_SIZE + GAP;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function everyPairSeparatedByAtLeast(
  positions: readonly { x: number; y: number }[],
  min: number,
): boolean {
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      if (distance(positions[i], positions[j]) < min - 1e-6) {
        return false;
      }
    }
  }
  return true;
}

function allInsideBowl(
  positions: readonly { x: number; y: number }[],
  bounds: CupBounds,
  dieHalfSize: number,
): boolean {
  const usableRx = bounds.radiusX - dieHalfSize;
  const usableRy = bounds.radiusY - dieHalfSize;
  return positions.every(
    (p) => (p.x * p.x) / (usableRx * usableRx) + (p.y * p.y) / (usableRy * usableRy) <= 1 + 1e-6,
  );
}

describe('computeFinalLayout — stable, non-overlapping final positions for 1-5 dice', () => {
  it('places a single die at the exact center', () => {
    expect(computeFinalLayout(1, ROOMY_BOUNDS, DIE_HALF_SIZE, GAP)).toEqual([{ x: 0, y: 0 }]);
  });

  it('returns an empty layout for zero dice', () => {
    expect(computeFinalLayout(0, ROOMY_BOUNDS, DIE_HALF_SIZE, GAP)).toEqual([]);
  });

  for (const count of [2, 3, 4, 5]) {
    it(`returns ${count} distinct, non-overlapping positions inside the bowl with the roomy bounds`, () => {
      const positions = computeFinalLayout(count, ROOMY_BOUNDS, DIE_HALF_SIZE, GAP);
      expect(positions).toHaveLength(count);
      expect(everyPairSeparatedByAtLeast(positions, MIN_SEPARATION)).toBe(true);
      expect(allInsideBowl(positions, ROOMY_BOUNDS, DIE_HALF_SIZE)).toBe(true);
      for (const p of positions) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    });
  }

  it('places 5 dice in a quincunx: one at the exact center, four spread around it', () => {
    const positions = computeFinalLayout(5, ROOMY_BOUNDS, DIE_HALF_SIZE, GAP);
    expect(positions[0]).toEqual({ x: 0, y: 0 });
    const outer = positions.slice(1);
    expect(outer).toHaveLength(4);
    // All four outer dice sit at the same distance from center (a clean ring), not scattered.
    const radii = outer.map((p) => Math.hypot(p.x, p.y));
    for (const r of radii) {
      expect(r).toBeCloseTo(radii[0], 5);
    }
  });

  it('balances 2 dice left/right rather than up/down', () => {
    const positions = computeFinalLayout(2, ROOMY_BOUNDS, DIE_HALF_SIZE, GAP);
    expect(positions[0]?.y).toBeCloseTo(0, 5);
    expect(positions[1]?.y).toBeCloseTo(0, 5);
    expect(positions[0]?.x).toBeCloseTo(-(positions[1]?.x ?? 0), 5);
  });

  it('recomputes safely (still valid, still fits) when the bowl shrinks a lot', () => {
    const tightBounds: CupBounds = { radiusX: 40, radiusY: 35 };
    const positions = computeFinalLayout(5, tightBounds, DIE_HALF_SIZE, GAP);
    expect(positions).toHaveLength(5);
    expect(allInsideBowl(positions, tightBounds, DIE_HALF_SIZE)).toBe(true);
    for (const p of positions) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('recomputes safely when the bowl grows', () => {
    const bigBounds: CupBounds = { radiusX: 300, radiusY: 260 };
    const positions = computeFinalLayout(5, bigBounds, DIE_HALF_SIZE, GAP);
    expect(positions).toHaveLength(5);
    expect(allInsideBowl(positions, bigBounds, DIE_HALF_SIZE)).toBe(true);
    // With this much room, the ideal (uncompressed) separation is achievable exactly.
    expect(everyPairSeparatedByAtLeast(positions, MIN_SEPARATION)).toBe(true);
  });

  it('produces a different (correctly re-fitted) layout when dice count changes for the same bowl', () => {
    const threeDice = computeFinalLayout(3, ROOMY_BOUNDS, DIE_HALF_SIZE, GAP);
    const fiveDice = computeFinalLayout(5, ROOMY_BOUNDS, DIE_HALF_SIZE, GAP);
    expect(threeDice).toHaveLength(3);
    expect(fiveDice).toHaveLength(5);
  });
});
