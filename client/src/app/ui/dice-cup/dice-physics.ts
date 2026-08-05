/**
 * Pure, framework-free 2D kinematic helpers for the dice-cup shake animation (client presentation
 * only — see dice-cup.ts). Nothing here touches the DOM, Angular, GameStore, or SocketService,
 * and nothing here ever decides an authoritative die value; it only moves cosmetic visual
 * objects around inside a bowl. Kept separate from the Angular component specifically so it can
 * be unit-tested as plain data-in/data-out functions.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Vec2 = { x: 0, y: 0 };

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len > 1e-6 ? scale(a, 1 / len) : ZERO;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function isFiniteVec(v: Vec2): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

/** Guards against NaN/Infinity ever reaching rendered state (e.g. from a division by ~0). */
export function sanitizeVec(v: Vec2, fallback: Vec2 = ZERO): Vec2 {
  return isFiniteVec(v) ? v : fallback;
}

export function sanitizeNumber(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/** A visual-only die object — position/velocity/rotation for the shake sim. Equal mass for all
 * dice (5.3: at most 5 dice in a hand, no per-die weighting needed). `hop` is a 0..1 cosmetic
 * "currently popped up" progress used only for a brief scale/shadow cue, never for physics. */
export interface PhysicsDie {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly rotationDeg: number;
  readonly angularVelocityDegPerSec: number;
  readonly hop: number;
}

/** The cup's usable inner bowl, an ellipse centered at the origin in the same coordinate space
 * as die positions (already excludes rim thickness and a small die-radius padding). */
export interface CupBounds {
  readonly radiusX: number;
  readonly radiusY: number;
}

export interface PhysicsProfile {
  /** Exponential velocity damping coefficient (per second) — higher = loses speed faster. */
  readonly damping: number;
  readonly wallRestitution: number;
  readonly wallFriction: number;
  readonly pairRestitution: number;
  readonly pairFriction: number;
  readonly maxSpeed: number;
}

const MAX_DT_MS = 48;

/** Caps and converts a raw frame delta (ms) to seconds — protects the sim from huge jumps after
 * a dropped frame, tab switch, or debugger pause. */
export function clampDeltaSeconds(dtMs: number, maxDtMs: number = MAX_DT_MS): number {
  const bounded = Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), maxDtMs) : 0;
  return bounded / 1000;
}

export function clampSpeed(v: Vec2, maxSpeed: number): Vec2 {
  const len = length(v);
  if (len <= maxSpeed || len <= 0) {
    return v;
  }
  return scale(v, maxSpeed / len);
}

/** v(t+dt) = v(t) * e^(-damping*dt) — smooth, monotonic decay toward zero, never overshoots. */
export function applyDamping(v: Vec2, dampingPerSecond: number, dtSeconds: number): Vec2 {
  const factor = Math.exp(-dampingPerSecond * dtSeconds);
  return scale(v, factor);
}

export interface WallCollisionResult {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly collided: boolean;
}

/**
 * Keeps a die inside the elliptical inner bowl: pushes it back onto the boundary, reflects the
 * outward-moving component of its velocity (restitution = bounce), and damps the tangential
 * (sliding-along-the-wall) component (friction) — so a wall hit looks like a bounce, not a
 * perfect mirror. `dieRadius` shrinks the usable ellipse so the die's edge (not its center)
 * stays inside the visible bowl.
 */
export function resolveWallCollision(
  position: Vec2,
  velocity: Vec2,
  bounds: CupBounds,
  dieRadius: number,
  restitution: number,
  friction: number,
): WallCollisionResult {
  const usableRx = Math.max(bounds.radiusX - dieRadius, 1);
  const usableRy = Math.max(bounds.radiusY - dieRadius, 1);
  const nx = position.x / usableRx;
  const ny = position.y / usableRy;
  const dist = Math.hypot(nx, ny);
  if (dist <= 1 || dist === 0) {
    return { position, velocity, collided: false };
  }

  const pulledBack = scale(position, 1 / dist);
  const normal = normalize({
    x: pulledBack.x / (usableRx * usableRx),
    y: pulledBack.y / (usableRy * usableRy),
  });
  const normalSpeed = dot(velocity, normal);
  const reflected =
    normalSpeed > 0 ? sub(velocity, scale(normal, (1 + restitution) * normalSpeed)) : velocity;
  const tangential = sub(reflected, scale(normal, dot(reflected, normal)));
  const normalPart = sub(reflected, tangential);
  const finalVelocity = add(normalPart, scale(tangential, 1 - friction));
  return {
    position: sanitizeVec(pulledBack, position),
    velocity: sanitizeVec(finalVelocity),
    collided: true,
  };
}

export interface PairCollisionResult {
  readonly positionA: Vec2;
  readonly velocityA: Vec2;
  readonly positionB: Vec2;
  readonly velocityB: Vec2;
  readonly collided: boolean;
}

/**
 * Equal-mass circle-circle collision between two dice: separates them along the collision
 * normal, then — only if they're actually approaching each other — exchanges the normal
 * component of their velocity (scaled by restitution) and damps the tangential component
 * (friction), so it reads as a die knocking into another rather than a perfectly elastic
 * billiard-ball hit. A die moving faster into another transfers proportionally more of its
 * momentum, since the impulse magnitude scales directly with the approach speed.
 */
export function resolvePairCollision(
  positionA: Vec2,
  velocityA: Vec2,
  positionB: Vec2,
  velocityB: Vec2,
  dieRadius: number,
  restitution: number,
  friction: number,
): PairCollisionResult {
  const delta = sub(positionB, positionA);
  const dist = length(delta);
  const minDist = dieRadius * 2;
  if (dist >= minDist || dist < 1e-6) {
    return { positionA, velocityA, positionB, velocityB, collided: false };
  }

  const normal = scale(delta, 1 / dist);
  const overlap = minDist - dist;
  const correction = scale(normal, overlap / 2);
  const newPositionA = sub(positionA, correction);
  const newPositionB = add(positionB, correction);

  const relativeVelocity = sub(velocityB, velocityA);
  const approachSpeed = dot(relativeVelocity, normal);
  if (approachSpeed >= 0) {
    return {
      positionA: newPositionA,
      velocityA,
      positionB: newPositionB,
      velocityB,
      collided: true,
    };
  }

  const impulse = scale(normal, (-(1 + restitution) * approachSpeed) / 2);
  const rawA = sub(velocityA, impulse);
  const rawB = add(velocityB, impulse);
  const tangent: Vec2 = { x: -normal.y, y: normal.x };
  const dampedA = add(
    scale(normal, dot(rawA, normal)),
    scale(tangent, dot(rawA, tangent) * (1 - friction)),
  );
  const dampedB = add(
    scale(normal, dot(rawB, normal)),
    scale(tangent, dot(rawB, tangent) * (1 - friction)),
  );
  return {
    positionA: sanitizeVec(newPositionA, positionA),
    velocityA: sanitizeVec(dampedA),
    positionB: sanitizeVec(newPositionB, positionB),
    velocityB: sanitizeVec(dampedB),
    collided: true,
  };
}

/** Runs every unique pair through {@link resolvePairCollision} once per frame — O(n²), which is
 * fine for at most 5 dice. Returns which indices were involved in a collision this frame so the
 * caller can trigger a cosmetic hop/face-flicker on them. */
export function resolveAllPairCollisions(
  dice: readonly PhysicsDie[],
  dieRadius: number,
  restitution: number,
  friction: number,
): { dice: PhysicsDie[]; collidedIndices: ReadonlySet<number> } {
  const next = dice.map((d) => d);
  const collidedIndices = new Set<number>();
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i];
      const b = next[j];
      const result = resolvePairCollision(
        a.position,
        a.velocity,
        b.position,
        b.velocity,
        dieRadius,
        restitution,
        friction,
      );
      if (result.collided) {
        next[i] = { ...a, position: result.positionA, velocity: result.velocityA };
        next[j] = { ...b, position: result.positionB, velocity: result.velocityB };
        collidedIndices.add(i);
        collidedIndices.add(j);
      }
    }
  }
  return { dice: next, collidedIndices };
}

/** One physics step for a single die: accumulated force -> damped velocity -> bounded speed ->
 * integrated position -> wall collision. Pair collisions are a separate whole-array pass (see
 * {@link resolveAllPairCollisions}) since they need every die's position, not just one. */
export function integrateDie(
  die: PhysicsDie,
  force: Vec2,
  dtSeconds: number,
  bounds: CupBounds,
  dieRadius: number,
  profile: PhysicsProfile,
): PhysicsDie {
  const accelerated = add(die.velocity, scale(force, dtSeconds));
  const damped = applyDamping(sanitizeVec(accelerated, die.velocity), profile.damping, dtSeconds);
  const bounded = clampSpeed(damped, profile.maxSpeed);
  const nextPosition = sanitizeVec(add(die.position, scale(bounded, dtSeconds)), die.position);
  const wall = resolveWallCollision(
    nextPosition,
    bounded,
    bounds,
    dieRadius,
    profile.wallRestitution,
    profile.wallFriction,
  );
  const angularDamped = sanitizeNumber(
    die.angularVelocityDegPerSec * Math.exp(-profile.damping * dtSeconds),
  );
  const nextRotation = sanitizeNumber(die.rotationDeg + angularDamped * dtSeconds, die.rotationDeg);
  return {
    position: wall.position,
    velocity: wall.velocity,
    rotationDeg: nextRotation,
    angularVelocityDegPerSec: angularDamped,
    hop: Math.max(0, die.hop - dtSeconds * 2.5),
  };
}

/** A single simulated "hand shake" impulse — a smoothed attack/peak/decay force applied to every
 * die at once (in cup-local coordinates), not an instant one-frame velocity jump. Several of
 * these, scheduled with varied direction/strength/duration/timing, are what make the motion read
 * as "someone shaking a cup" rather than dice drifting independently. */
export interface HandImpulse {
  readonly direction: Vec2;
  readonly strength: number;
  readonly startMs: number;
  readonly durationMs: number;
}

/** Smooth single-hump envelope in [0,1]: a quicker attack than decay (the exponent < 1 pulls the
 * peak earlier in the window), never a linear ramp or an instant jump. */
export function impulseEnvelope(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs <= 0 || elapsedMs >= durationMs) {
    return 0;
  }
  const t = elapsedMs / durationMs;
  return Math.sin(Math.PI * Math.pow(t, 0.7));
}

/** Sum of every currently-active impulse's contribution at `nowMs`, in cup-local force units. */
export function computeImpulseForce(impulses: readonly HandImpulse[], nowMs: number): Vec2 {
  return impulses.reduce((acc, impulse) => {
    const envelope = impulseEnvelope(nowMs - impulse.startMs, impulse.durationMs);
    return envelope > 0 ? add(acc, scale(impulse.direction, impulse.strength * envelope)) : acc;
  }, ZERO);
}

/**
 * Builds 3-5 hand-shake impulses spanning `totalDurationMs`, each with a randomized direction,
 * strength, duration, and a varied (non-periodic) gap before the next one starts — "the next
 * hand movement arrives from a different direction before all dice have settled." Consecutive
 * impulses are deliberately pushed toward roughly opposite directions (a reversal, ± jitter)
 * rather than fully random consecutive angles, so the motion reads as an actual back-and-forth
 * shake rather than dice drifting to random unrelated headings.
 *
 * `boundsRadius` (the smaller of the bowl's two radii) scales the strength so the resulting
 * motion is visible relative to the ACTUAL bowl size, whatever that is — a bigger cup needs a
 * proportionally stronger shove to still cover a comparable fraction of its diameter.
 */
export function generateHandImpulses(
  totalDurationMs: number,
  boundsRadius: number,
  random: () => number = Math.random,
): HandImpulse[] {
  const count = 3 + Math.floor(random() * 3);
  const impulses: HandImpulse[] = [];
  let cursor = 0;
  let previousAngle: number | null = null;
  for (let i = 0; i < count; i += 1) {
    const remainingSlots = count - i;
    const avgSlot = Math.max((totalDurationMs - cursor) / remainingSlots, 1);
    const durationMs = avgSlot * (0.4 + random() * 0.3);
    const jitter = (random() - 0.5) * (Math.PI / 2.5); // up to ±~36°, keeps reversals irregular
    const angle: number =
      previousAngle === null ? random() * Math.PI * 2 : previousAngle + Math.PI + jitter;
    previousAngle = angle;
    impulses.push({
      direction: { x: Math.cos(angle), y: Math.sin(angle) },
      strength: boundsRadius * (20 + random() * 20),
      startMs: cursor,
      durationMs,
    });
    cursor += avgSlot * (0.7 + random() * 0.5);
  }
  return impulses;
}

/** Scattered, non-overlapping-ish starting positions for the chaotic phase — an even angular
 * spread across most of the usable bowl radius with randomized jitter, not all dice stacked at
 * the center (a wide starting spread means the very first frames already show clear separation
 * and motion, rather than dice slowly crawling outward from a clump). */
export function createScatteredPositions(
  diceCount: number,
  bounds: CupBounds,
  dieRadius: number,
  random: () => number = Math.random,
): Vec2[] {
  const usableRx = Math.max(bounds.radiusX - dieRadius, 1) * 0.75;
  const usableRy = Math.max(bounds.radiusY - dieRadius, 1) * 0.75;
  return Array.from({ length: diceCount }, (_, i) => {
    const angle = (i / Math.max(diceCount, 1)) * Math.PI * 2 + random() * 0.6;
    const radiusJitter = 0.35 + random() * 0.65;
    return {
      x: Math.cos(angle) * usableRx * radiusJitter,
      y: Math.sin(angle) * usableRy * radiusJitter,
    };
  });
}
