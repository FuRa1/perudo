import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { DiceValue } from '@shared';
import { DIE_SIZE_PX } from '../die/die-size.config';
import { Die } from '../die/die';
import type { SeatSize } from '../seat-card/seat-card';
import {
  CUP_SIZE_PX,
  DICE_CUP_CSS_CLASS,
  DIE_COLLISION_RADIUS_RATIO,
  DIE_GAP_PX,
  INNER_BOWL_RATIO,
  OWNER_CUP_FALLBACK_PX,
  PHASE_DURATION_MS,
  PHYSICS_PROFILES,
  randomInRange,
} from './dice-cup.config';
import { computeFinalLayout } from './dice-layout';
import {
  add,
  clampDeltaSeconds,
  computeImpulseForce,
  createScatteredPositions,
  generateHandImpulses,
  impulseEnvelope,
  integrateDie,
  length,
  resolveAllPairCollisions,
  scale as scaleVec,
  sub,
  type CupBounds,
  type HandImpulse,
  type PhysicsDie,
  type PhysicsProfile,
  type Vec2,
} from './dice-physics';

type Phase =
  'idle' | 'chaotic' | 'energyLoss' | 'settling' | 'waitingForServer' | 'calmSettle' | 'done';

interface DieView {
  readonly transform: string;
  readonly face: DiceValue;
  readonly opacity: number;
  readonly zIndex: number;
}

const ZERO: Vec2 = { x: 0, y: 0 };

function randomFace(random: () => number): DiceValue {
  return (Math.floor(random() * 6) + 1) as DiceValue;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * A stylized 2D dice-cup renderer (client presentation only — CLAUDE.md 8.2/3.5). Independent of
 * GameStore/SocketService/server events/game rules: it only ever reacts to plain inputs, and the
 * calling component (SeatCard) decides what those inputs mean. `dice` is the sole source of
 * truth for final values — every visual face shown before settling is explicitly cosmetic (see
 * dice-physics.ts) and is discarded the moment the real values are available.
 *
 * The 2D physics-driven renderer here can later be swapped for a texture-backed or fully 3D cup
 * without touching match state, socket logic, or this component's own input contract — see
 * dice-cup.config.ts for where all the swappable visual specifics (colors, sizes, durations)
 * live.
 */
@Component({
  selector: 'app-dice-cup',
  standalone: true,
  imports: [Die],
  templateUrl: './dice-cup.html',
})
export class DiceCup {
  /** The local player's authoritative dice, once known — null/empty means "not dealt yet". */
  readonly dice = input<readonly DiceValue[] | null>(null);
  readonly diceCount = input.required<number>();
  readonly isOwner = input(false);
  /** Cosmetic hand-roll trigger — for the owner, only the false->true rising edge matters (it
   * starts a new internally-timed shake); for an opponent it directly drives the closed-cup
   * shake CSS class for as long as it stays true. */
  readonly isRolling = input(false);
  readonly size = input<SeatSize>('medium');

  private readonly ownerCupEl = viewChild<ElementRef<HTMLElement>>('ownerCupEl');

  protected readonly cssClass = DICE_CUP_CSS_CLASS;
  protected readonly dieSizePx = DIE_SIZE_PX.table;
  /** The owner's cup is sized by CSS (`.dice-cup-owner-shell`, a `clamp()`); this signal mirrors
   * whatever the browser actually rendered (via ResizeObserver) so physics/layout math always
   * matches reality instead of a guessed number. Falls back to a sane default before the first
   * measurement lands. */
  private readonly measuredOwnerSizePx = signal<number | null>(null);
  protected readonly cupSizePx = computed(() =>
    this.isOwner()
      ? (this.measuredOwnerSizePx() ?? OWNER_CUP_FALLBACK_PX)
      : CUP_SIZE_PX[this.size()],
  );
  protected readonly isClosedShaking = computed(() => !this.isOwner() && this.isRolling());
  /** The visible inner-bowl inset, matching INNER_BOWL_RATIO so the drawn bowl lines up with
   * where the physics sim actually lets dice travel. CSS `inset` shorthand takes `vertical
   * horizontal`. */
  protected readonly innerBowlInset = computed(() => {
    const yPercent = (1 - INNER_BOWL_RATIO.y) * 50;
    const xPercent = (1 - INNER_BOWL_RATIO.x) * 50;
    return `${yPercent}% ${xPercent}%`;
  });

  protected readonly dieViews = signal<readonly DieView[]>([]);
  protected readonly cupTransform = signal('translate(0px, 0px) rotate(0deg)');

  private readonly destroyRef = inject(DestroyRef);
  private readonly random: () => number = Math.random;

  private animationFrameId: number | null = null;
  private lastFrameTimeMs: number | null = null;
  private wasRolling = false;
  private hadDice = false;
  private resizeObserver: ResizeObserver | null = null;

  private simDice: PhysicsDie[] = [];
  private simFaces: DiceValue[] = [];
  private impulses: HandImpulse[] = [];
  private triggeredImpulseIndices = new Set<number>();
  private phase: Phase = 'idle';
  private phaseElapsedMs = 0;
  private chaoticDurationMs = 0;
  private energyLossDurationMs = 0;
  private settleDurationMs = 0;
  private restSlots: readonly Vec2[] = [];
  private serverDice: readonly DiceValue[] | null = null;
  private cupOffsetPx: Vec2 = ZERO;
  private cupTiltDeg = 0;

  constructor() {
    effect(() => this.handleRollingChange(this.isRolling()));
    effect(() => this.handleDiceChange(this.dice()));
    effect(() => this.observeOwnerCupSize(this.ownerCupEl()));
    this.destroyRef.onDestroy(() => {
      this.stopLoop();
      this.resizeObserver?.disconnect();
    });
  }

  private observeOwnerCupSize(elRef: ElementRef<HTMLElement> | undefined): void {
    if (!elRef || this.resizeObserver || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const measured = Math.min(entry.contentRect.width, entry.contentRect.height);
      if (measured > 0) {
        this.measuredOwnerSizePx.set(measured);
      }
    });
    this.resizeObserver.observe(elRef.nativeElement);
  }

  private handleRollingChange(rolling: boolean): void {
    if (this.isOwner() && rolling && !this.wasRolling) {
      this.beginShake();
    }
    this.wasRolling = rolling;
  }

  private handleDiceChange(values: readonly DiceValue[] | null): void {
    const hasValues = !!values && values.length > 0;
    if (this.isOwner() && hasValues) {
      if (this.isAnimating()) {
        this.serverDice = values;
      } else if (!this.hadDice) {
        this.beginCalmSettle(values);
      }
    } else if (this.isOwner() && !hasValues && this.hadDice) {
      // The server cleared our hand (a new round started) — reset so the cup shows empty until
      // we actually roll again, instead of the previous round's dice lingering on screen
      // forever. Unconditional regardless of `isAnimating()`: even mid fade-in/shake, a genuine
      // hand-clear means there's nothing left to keep animating toward.
      this.resetToEmpty();
    }
    this.hadDice = hasValues;
  }

  private resetToEmpty(): void {
    this.stopLoop();
    this.simDice = [];
    this.simFaces = [];
    this.phase = 'idle';
    this.phaseElapsedMs = 0;
    this.serverDice = null;
    this.dieViews.set([]);
  }

  private isAnimating(): boolean {
    return this.phase !== 'idle' && this.phase !== 'done';
  }

  private bounds(): CupBounds {
    const radius = this.cupSizePx() / 2;
    return { radiusX: radius * INNER_BOWL_RATIO.x, radiusY: radius * INNER_BOWL_RATIO.y };
  }

  /** Physics collision radius — deliberately smaller than the visual die so dice may overlap a
   * little mid-shuffle without looking broken (see dice-cup.config.ts). */
  private physicsDieRadius(): number {
    return (this.dieSizePx / 2) * DIE_COLLISION_RADIUS_RATIO;
  }

  /** Full visual die half-size, used only for the final resting layout (dice-layout.ts) — the
   * resting arrangement must never overlap, unlike mid-shuffle. */
  private layoutDieHalfSize(): number {
    return this.dieSizePx / 2;
  }

  private beginShake(): void {
    const count = this.diceCount();
    const bounds = this.bounds();
    this.restSlots = computeFinalLayout(count, bounds, this.layoutDieHalfSize(), DIE_GAP_PX);
    const currentDice = this.dice();
    this.serverDice = currentDice && currentDice.length > 0 ? currentDice : null;

    if (prefersReducedMotion()) {
      this.beginReducedMotionSettle(count);
      return;
    }

    const dieRadius = this.physicsDieRadius();
    const positions = createScatteredPositions(count, bounds, dieRadius, this.random);
    this.simDice = positions.map((position) => ({
      position,
      velocity: { x: (this.random() - 0.5) * 400, y: (this.random() - 0.5) * 400 },
      rotationDeg: this.random() * 360,
      angularVelocityDegPerSec: (this.random() - 0.5) * 300,
      hop: 0,
    }));
    this.simFaces = Array.from({ length: count }, () => randomFace(this.random));
    this.chaoticDurationMs = randomInRange(PHASE_DURATION_MS.chaotic, this.random);
    this.energyLossDurationMs = randomInRange(PHASE_DURATION_MS.energyLoss, this.random);
    this.settleDurationMs = randomInRange(PHASE_DURATION_MS.settle, this.random);
    const boundsRadius = Math.min(bounds.radiusX, bounds.radiusY);
    this.impulses = generateHandImpulses(this.chaoticDurationMs, boundsRadius, this.random);
    this.triggeredImpulseIndices = new Set();
    this.phase = 'chaotic';
    this.phaseElapsedMs = 0;
    this.cupOffsetPx = ZERO;
    this.cupTiltDeg = 0;
    this.startLoop();
  }

  /** `prefers-reduced-motion`: a short, restrained ease straight to the final layout instead of
   * the full chaotic shake — reuses the 'settling' step logic (still waits for the authoritative
   * server dice + a minimum duration, never fabricates a result), just with no chaos beforehand. */
  private beginReducedMotionSettle(count: number): void {
    this.simDice = this.restSlots.map((position) => ({
      position: scaleVec(position, 0.5),
      velocity: ZERO,
      rotationDeg: this.random() * 16 - 8,
      angularVelocityDegPerSec: 0,
      hop: 0,
    }));
    this.simFaces = Array.from({ length: count }, () => randomFace(this.random));
    this.settleDurationMs = PHASE_DURATION_MS.reducedMotionSettle;
    this.phase = 'settling';
    this.phaseElapsedMs = 0;
    this.cupOffsetPx = ZERO;
    this.cupTiltDeg = 0;
    this.startLoop();
  }

  private beginCalmSettle(values: readonly DiceValue[]): void {
    const bounds = this.bounds();
    this.restSlots = computeFinalLayout(
      values.length,
      bounds,
      this.layoutDieHalfSize(),
      DIE_GAP_PX,
    );
    this.simDice = this.restSlots.map((position) => ({
      position,
      velocity: ZERO,
      rotationDeg: this.random() * 30 - 15,
      angularVelocityDegPerSec: 0,
      hop: 0,
    }));
    this.simFaces = [...values];
    this.serverDice = values;
    this.phase = 'calmSettle';
    this.phaseElapsedMs = 0;
    this.startLoop();
  }

  private startLoop(): void {
    this.publishFrame();
    if (this.animationFrameId !== null) {
      return;
    }
    this.lastFrameTimeMs = null;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.lastFrameTimeMs = null;
  }

  private readonly tick = (now: number): void => {
    const dtMs = this.lastFrameTimeMs === null ? 16 : now - this.lastFrameTimeMs;
    this.lastFrameTimeMs = now;
    this.advancePhase(dtMs);
    this.publishFrame();
    if (this.phase === 'done') {
      this.stopLoop();
      return;
    }
    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private advancePhase(dtMs: number): void {
    this.phaseElapsedMs += dtMs;
    if (this.phase === 'chaotic') {
      this.stepShakingPhase(dtMs, PHYSICS_PROFILES.chaotic, true);
      if (this.phaseElapsedMs >= this.chaoticDurationMs) {
        this.enterPhase('energyLoss');
      }
    } else if (this.phase === 'energyLoss') {
      this.stepShakingPhase(dtMs, PHYSICS_PROFILES.energyLoss, false);
      if (this.phaseElapsedMs >= this.energyLossDurationMs) {
        this.enterPhase('settling');
      }
    } else if (this.phase === 'settling') {
      this.stepSettlingPhase(dtMs);
    } else if (this.phase === 'waitingForServer') {
      this.stepWaitingForServer(dtMs);
    } else if (this.phase === 'calmSettle') {
      this.stepCalmSettlePhase();
    }
  }

  private enterPhase(next: Phase): void {
    this.phase = next;
    this.phaseElapsedMs = 0;
  }

  /**
   * Chaotic and energy-loss share the same stepping logic — only the physics profile and
   * whether new hand impulses are still contributing differ between them.
   *
   * The impulse force drives the CUP in one direction (`updateCupMotion`) while the DICE receive
   * the *opposite* pseudo-force, in cup-local coordinates — the standard non-inertial-frame
   * effect of being inside something that just accelerated: when the cup jerks right, the dice
   * (lagging behind due to inertia) appear to slide left relative to it, toward the opposite
   * wall, exactly as a real handful of dice would in a real shaken cup.
   */
  private stepShakingPhase(dtMs: number, profile: PhysicsProfile, useImpulses: boolean): void {
    const dt = clampDeltaSeconds(dtMs);
    const bounds = this.bounds();
    const dieRadius = this.physicsDieRadius();
    const handForce = useImpulses ? computeImpulseForce(this.impulses, this.phaseElapsedMs) : ZERO;
    const dieForce = scaleVec(handForce, -1);
    this.simDice = this.simDice.map((die) =>
      integrateDie(die, dieForce, dt, bounds, dieRadius, profile),
    );
    const paired = resolveAllPairCollisions(
      this.simDice,
      dieRadius,
      profile.pairRestitution,
      profile.pairFriction,
    );
    this.simDice = paired.dice;
    this.triggerHopAndFaceFlicker(paired.collidedIndices);
    if (useImpulses) {
      this.checkImpulsePeaks();
    }
    this.updateCupMotion(handForce, dt);
  }

  private triggerHopAndFaceFlicker(indices: ReadonlySet<number>): void {
    if (indices.size === 0) {
      return;
    }
    this.simDice = this.simDice.map((die, i) => (indices.has(i) ? { ...die, hop: 1 } : die));
    this.simFaces = this.simFaces.map((face, i) =>
      indices.has(i) ? randomFace(this.random) : face,
    );
  }

  /** Flickers every die's cosmetic face once per hand-impulse, right as that impulse peaks — a
   * discrete, sparse moment (not every frame) that reads as "the cup just got shaken again". */
  private checkImpulsePeaks(): void {
    this.impulses.forEach((impulse, index) => {
      if (this.triggeredImpulseIndices.has(index)) {
        return;
      }
      const envelope = impulseEnvelope(this.phaseElapsedMs - impulse.startMs, impulse.durationMs);
      if (envelope >= 0.85) {
        this.triggeredImpulseIndices.add(index);
        this.simFaces = this.simFaces.map(() => randomFace(this.random));
        this.simDice = this.simDice.map((die) => ({ ...die, hop: Math.max(die.hop, 0.6) }));
      }
    });
  }

  /** The cup itself: a small offset/tilt pushed by the current hand-impulse force, continuously
   * damped back toward neutral — "the container moves, the dice react more dramatically". */
  private updateCupMotion(handForce: Vec2, dt: number): void {
    const pushed = add(this.cupOffsetPx, scaleVec(handForce, dt * 0.006));
    const decayFactor = Math.exp(-6 * dt);
    this.cupOffsetPx = scaleVec(pushed, decayFactor);
    const maxOffset = 7;
    const offsetLength = length(this.cupOffsetPx);
    if (offsetLength > maxOffset) {
      this.cupOffsetPx = scaleVec(this.cupOffsetPx, maxOffset / offsetLength);
    }
    this.cupTiltDeg = Math.max(-5, Math.min(5, this.cupOffsetPx.x * 0.6));
  }

  private stepSettlingPhase(dtMs: number): void {
    const dt = clampDeltaSeconds(dtMs);
    const bounds = this.bounds();
    const dieRadius = this.physicsDieRadius();
    this.simDice = this.simDice.map((die, i) => {
      const target = this.restSlots[i] ?? die.position;
      const eased = add(die.position, scaleVec(sub(target, die.position), Math.min(dt * 4, 1)));
      // The settle profile's strong damping (PHYSICS_PROFILES.settle) already brings angular
      // velocity — and with it, rotation drift — to a near-stop on its own; no extra easing needed.
      return integrateDie(
        { ...die, position: eased },
        ZERO,
        dt,
        bounds,
        dieRadius,
        PHYSICS_PROFILES.settle,
      );
    });
    this.updateCupMotion(ZERO, dt);
    if (this.phaseElapsedMs < this.settleDurationMs) {
      return;
    }
    if (this.serverDice && this.serverDice.length > 0) {
      this.finishSettle(this.serverDice);
    } else {
      this.enterPhase('waitingForServer');
    }
  }

  private stepWaitingForServer(dtMs: number): void {
    const dt = clampDeltaSeconds(dtMs);
    const bounds = this.bounds();
    const dieRadius = this.physicsDieRadius();
    const wobble = this.phaseElapsedMs / 1000;
    this.simDice = this.simDice.map((die, i) => {
      const jitter = { x: Math.sin(wobble * 2 + i) * 4, y: Math.cos(wobble * 1.7 + i) * 3 };
      const target = add(this.restSlots[i] ?? die.position, jitter);
      const eased = add(die.position, scaleVec(sub(target, die.position), Math.min(dt * 3, 1)));
      return integrateDie(
        { ...die, position: eased },
        ZERO,
        dt,
        bounds,
        dieRadius,
        PHYSICS_PROFILES.idle,
      );
    });
    if (this.serverDice && this.serverDice.length > 0) {
      this.finishSettle(this.serverDice);
    }
  }

  private finishSettle(values: readonly DiceValue[]): void {
    this.simFaces = [...values];
    this.simDice = this.simDice.map((die, i) => ({
      ...die,
      position: this.restSlots[i] ?? die.position,
      velocity: ZERO,
      angularVelocityDegPerSec: 0,
      hop: 0,
    }));
    this.cupOffsetPx = ZERO;
    this.cupTiltDeg = 0;
    this.phase = 'done';
  }

  private stepCalmSettlePhase(): void {
    if (this.phaseElapsedMs >= PHASE_DURATION_MS.calmSettle) {
      this.phase = 'done';
    }
  }

  private publishFrame(): void {
    const fadeIn =
      this.phase === 'calmSettle'
        ? Math.min(this.phaseElapsedMs / PHASE_DURATION_MS.calmSettle, 1)
        : 1;
    this.dieViews.set(
      this.simDice.map((die, i) => {
        const hopScale = 1 + die.hop * 0.18;
        return {
          // The -50%/-50% centers the die square on its physics position (the wrapper itself is
          // positioned with its top-left corner at the cup's exact center, `left-1/2 top-1/2`).
          transform: `translate(calc(-50% + ${die.position.x}px), calc(-50% + ${die.position.y}px)) rotate(${die.rotationDeg}deg) scale(${hopScale})`,
          face: this.simFaces[i] ?? 1,
          opacity: fadeIn,
          // Depth ordering so crossing dice layer rather than glitch: a base layer from vertical
          // position (further "south" reads as closer/in front) plus a temporary boost while a
          // die is mid-hop from a recent collision, so the die that was just struck momentarily
          // renders on top of the others it's crossing.
          zIndex: Math.round(die.position.y) + Math.round(die.hop * 1000),
        };
      }),
    );
    this.cupTransform.set(
      `translate(${this.cupOffsetPx.x}px, ${this.cupOffsetPx.y}px) rotate(${this.cupTiltDeg}deg)`,
    );
  }
}
