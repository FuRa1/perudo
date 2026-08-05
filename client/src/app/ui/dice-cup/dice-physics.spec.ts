import {
  applyDamping,
  clampDeltaSeconds,
  clampSpeed,
  computeImpulseForce,
  createScatteredPositions,
  generateHandImpulses,
  impulseEnvelope,
  integrateDie,
  length,
  resolveAllPairCollisions,
  resolvePairCollision,
  resolveWallCollision,
  sanitizeNumber,
  sanitizeVec,
  type CupBounds,
  type PhysicsDie,
  type PhysicsProfile,
} from './dice-physics';

const BOUNDS: CupBounds = { radiusX: 100, radiusY: 80 };
const DIE_RADIUS = 12;

function die(overrides: Partial<PhysicsDie> = {}): PhysicsDie {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    rotationDeg: 0,
    angularVelocityDegPerSec: 0,
    hop: 0,
    ...overrides,
  };
}

const PROFILE: PhysicsProfile = {
  damping: 2,
  wallRestitution: 0.5,
  wallFriction: 0.3,
  pairRestitution: 0.5,
  pairFriction: 0.3,
  maxSpeed: 900,
};

describe('sanitize helpers', () => {
  it('replaces a NaN/Infinity vector with the fallback', () => {
    expect(sanitizeVec({ x: NaN, y: 1 })).toEqual({ x: 0, y: 0 });
    expect(sanitizeVec({ x: 1, y: Infinity }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(sanitizeVec({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it('replaces a NaN number with the fallback', () => {
    expect(sanitizeNumber(NaN, 7)).toBe(7);
    expect(sanitizeNumber(3)).toBe(3);
  });
});

describe('clampDeltaSeconds', () => {
  it('caps a large frame delta and converts ms to seconds', () => {
    expect(clampDeltaSeconds(16, 48)).toBeCloseTo(0.016);
    expect(clampDeltaSeconds(500, 48)).toBeCloseTo(0.048);
  });

  it('never returns a negative delta, even for negative input', () => {
    expect(clampDeltaSeconds(-100, 48)).toBe(0);
  });
});

describe('applyDamping', () => {
  it('reduces speed continuously over time, never increasing it', () => {
    const v = { x: 100, y: 0 };
    const after1 = applyDamping(v, 2, 0.1);
    const after2 = applyDamping(after1, 2, 0.1);
    expect(length(after1)).toBeLessThan(length(v));
    expect(length(after2)).toBeLessThan(length(after1));
  });

  it('approaches zero but never flips direction', () => {
    const v = { x: -50, y: 30 };
    const damped = applyDamping(v, 5, 1);
    expect(damped.x).toBeLessThanOrEqual(0);
    expect(damped.y).toBeGreaterThanOrEqual(0);
  });
});

describe('clampSpeed', () => {
  it('leaves a slow vector untouched', () => {
    expect(clampSpeed({ x: 10, y: 0 }, 900)).toEqual({ x: 10, y: 0 });
  });

  it('scales an over-fast vector down to exactly the max speed', () => {
    const clamped = clampSpeed({ x: 3000, y: 0 }, 900);
    expect(length(clamped)).toBeCloseTo(900);
  });
});

describe('resolveWallCollision — keeps dice inside the cup boundary', () => {
  it('does nothing when the die is well inside the bowl', () => {
    const result = resolveWallCollision(
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      BOUNDS,
      DIE_RADIUS,
      0.5,
      0.3,
    );
    expect(result.collided).toBe(false);
    expect(result.position).toEqual({ x: 0, y: 0 });
  });

  it('pulls a die that overshot the boundary back onto it', () => {
    const result = resolveWallCollision(
      { x: 500, y: 0 },
      { x: 400, y: 0 },
      BOUNDS,
      DIE_RADIUS,
      0.5,
      0.3,
    );
    expect(result.collided).toBe(true);
    const usableRx = BOUNDS.radiusX - DIE_RADIUS;
    expect(Math.abs(result.position.x)).toBeLessThanOrEqual(usableRx + 1e-6);
    expect(Number.isFinite(result.position.x)).toBe(true);
    expect(Number.isFinite(result.position.y)).toBe(true);
  });

  it('reflects the outward velocity component (bounces back) rather than passing through', () => {
    const result = resolveWallCollision(
      { x: 500, y: 0 },
      { x: 400, y: 0 },
      BOUNDS,
      DIE_RADIUS,
      0.5,
      0.3,
    );
    // Moving outward (+x) into the right wall must come back with a negative x velocity.
    expect(result.velocity.x).toBeLessThan(0);
  });

  it('never produces NaN/Infinity even from a zero-length position', () => {
    const result = resolveWallCollision(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      BOUNDS,
      DIE_RADIUS,
      0.5,
      0.3,
    );
    expect(Number.isFinite(result.position.x)).toBe(true);
    expect(Number.isFinite(result.position.y)).toBe(true);
  });
});

describe('resolvePairCollision — basic pair collision without invalid positions', () => {
  it('does nothing when the dice are far apart', () => {
    const result = resolvePairCollision(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 0 },
      DIE_RADIUS,
      0.5,
      0.3,
    );
    expect(result.collided).toBe(false);
  });

  it('separates two overlapping dice and keeps every value finite', () => {
    const result = resolvePairCollision(
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 10, y: 0 },
      { x: -50, y: 0 },
      DIE_RADIUS,
      0.5,
      0.3,
    );
    expect(result.collided).toBe(true);
    const separation = Math.hypot(
      result.positionB.x - result.positionA.x,
      result.positionB.y - result.positionA.y,
    );
    expect(separation).toBeCloseTo(DIE_RADIUS * 2, 5);
    for (const value of [
      result.positionA.x,
      result.positionA.y,
      result.velocityA.x,
      result.velocityA.y,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('does not apply an impulse when the dice are already separating', () => {
    const result = resolvePairCollision(
      { x: 0, y: 0 },
      { x: -50, y: 0 },
      { x: 10, y: 0 },
      { x: 50, y: 0 },
      DIE_RADIUS,
      0.5,
      0.3,
    );
    // Still "collided" (overlapping) so positions separate, but velocities pass through unchanged.
    expect(result.velocityA).toEqual({ x: -50, y: 0 });
    expect(result.velocityB).toEqual({ x: 50, y: 0 });
  });

  it('transfers more momentum to the slower die when one die approaches much faster', () => {
    // A fast die (speed 200) hits a nearly-still die (speed 5) head-on.
    const fastHitsSlow = resolvePairCollision(
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      DIE_RADIUS,
      0.6,
      0.2,
    );
    // The previously-slow die (B) must now be moving substantially faster than its original 5.
    expect(fastHitsSlow.velocityB.x).toBeGreaterThan(50);
    // The previously-fast die (A) must have slowed down noticeably from its original 200.
    expect(fastHitsSlow.velocityA.x).toBeLessThan(150);
  });

  it('never produces NaN even for exactly coincident positions', () => {
    const result = resolvePairCollision(
      { x: 5, y: 5 },
      { x: 1, y: 1 },
      { x: 5, y: 5 },
      { x: -1, y: -1 },
      DIE_RADIUS,
      0.5,
      0.3,
    );
    expect(Number.isFinite(result.positionA.x)).toBe(true);
    expect(Number.isFinite(result.positionA.y)).toBe(true);
    expect(Number.isFinite(result.positionB.x)).toBe(true);
    expect(Number.isFinite(result.positionB.y)).toBe(true);
  });
});

describe('resolveAllPairCollisions', () => {
  it('reports which dice collided this frame', () => {
    const dice: PhysicsDie[] = [
      die({ position: { x: 0, y: 0 }, velocity: { x: 50, y: 0 } }),
      die({ position: { x: 10, y: 0 }, velocity: { x: -50, y: 0 } }),
      die({ position: { x: 300, y: 300 }, velocity: { x: 0, y: 0 } }),
    ];
    const result = resolveAllPairCollisions(dice, DIE_RADIUS, 0.5, 0.3);
    expect(result.collidedIndices.has(0)).toBe(true);
    expect(result.collidedIndices.has(1)).toBe(true);
    expect(result.collidedIndices.has(2)).toBe(false);
  });
});

describe('integrateDie', () => {
  it('keeps a die inside the bowl and produces only finite values over many steps', () => {
    let current = die({ position: { x: 0, y: 0 }, velocity: { x: 300, y: 250 } });
    const force = { x: 500, y: -400 };
    for (let i = 0; i < 200; i += 1) {
      current = integrateDie(current, force, 1 / 60, BOUNDS, DIE_RADIUS, PROFILE);
      expect(Number.isFinite(current.position.x)).toBe(true);
      expect(Number.isFinite(current.position.y)).toBe(true);
      expect(Math.abs(current.position.x)).toBeLessThanOrEqual(BOUNDS.radiusX + 1e-6);
      expect(Math.abs(current.position.y)).toBeLessThanOrEqual(BOUNDS.radiusY + 1e-6);
    }
  });

  it('decays hop toward zero over time', () => {
    const started = die({ hop: 1 });
    const after = integrateDie(started, { x: 0, y: 0 }, 0.5, BOUNDS, DIE_RADIUS, PROFILE);
    expect(after.hop).toBeLessThan(1);
    expect(after.hop).toBeGreaterThanOrEqual(0);
  });
});

describe('impulseEnvelope', () => {
  it('is zero at the start and end of the window, positive in between', () => {
    expect(impulseEnvelope(0, 200)).toBe(0);
    expect(impulseEnvelope(200, 200)).toBe(0);
    expect(impulseEnvelope(60, 200)).toBeGreaterThan(0);
  });

  it('is zero for a non-positive or zero duration', () => {
    expect(impulseEnvelope(10, 0)).toBe(0);
  });
});

describe('computeImpulseForce', () => {
  it('sums contributions from overlapping impulses and ignores expired ones', () => {
    const impulses = [
      { direction: { x: 1, y: 0 }, strength: 100, startMs: 0, durationMs: 100 },
      { direction: { x: 0, y: 1 }, strength: 100, startMs: 1000, durationMs: 100 },
    ];
    const force = computeImpulseForce(impulses, 50);
    expect(force.x).toBeGreaterThan(0);
    expect(force.y).toBe(0);
  });
});

describe('generateHandImpulses', () => {
  it('produces between 3 and 5 impulses spanning the given duration', () => {
    const impulses = generateHandImpulses(1000, 68, () => 0.5);
    expect(impulses.length).toBeGreaterThanOrEqual(3);
    expect(impulses.length).toBeLessThanOrEqual(5);
    for (const impulse of impulses) {
      expect(impulse.durationMs).toBeGreaterThan(0);
      expect(Number.isFinite(impulse.direction.x)).toBe(true);
      expect(Number.isFinite(impulse.direction.y)).toBe(true);
    }
  });

  it('varies with the supplied randomness source (non-periodic schedule)', () => {
    let call = 0;
    const sequence = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5, 0.5, 0.5, 0.5];
    const random = () => sequence[call++ % sequence.length];
    const impulses = generateHandImpulses(1200, 68, random);
    const starts = impulses.map((i) => i.startMs);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('scales strength with the bowl radius, so a bigger bowl gets a proportionally stronger shove', () => {
    let call = 0;
    const sequence = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const random = () => sequence[call++ % sequence.length];
    const small = generateHandImpulses(1000, 40, random);
    call = 0;
    const large = generateHandImpulses(1000, 200, random);
    expect(large[0]?.strength).toBeGreaterThan((small[0]?.strength ?? 0) * 2);
  });

  it('sends consecutive impulses in roughly opposite directions (a shake reversal), not unrelated headings', () => {
    const impulses = generateHandImpulses(1200, 68, () => 0.5);
    for (let i = 1; i < impulses.length; i += 1) {
      const prev = impulses[i - 1]?.direction as { x: number; y: number };
      const curr = impulses[i]?.direction as { x: number; y: number };
      const dot = prev.x * curr.x + prev.y * curr.y;
      // Opposite-ish directions have a negative dot product (roughly < -0.5 given the ±36° jitter).
      expect(dot).toBeLessThan(-0.5);
    }
  });
});

describe('createScatteredPositions', () => {
  it('keeps every generated position within the usable bowl', () => {
    const positions = createScatteredPositions(5, BOUNDS, DIE_RADIUS);
    expect(positions).toHaveLength(5);
    for (const p of positions) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(BOUNDS.radiusX);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(BOUNDS.radiusY);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('spreads dice into distinct (non-identical) positions', () => {
    const positions = createScatteredPositions(5, BOUNDS, DIE_RADIUS, () => 0.5);
    const unique = new Set(positions.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(unique.size).toBe(positions.length);
  });
});
