import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DiceValue } from '@shared';
import { DIE_SIZE_PX } from '../die/die-size.config';
import { DiceCup } from './dice-cup';

/**
 * Replaces requestAnimationFrame/cancelAnimationFrame with a manually-steppable fake so tests
 * can advance the simulation deterministically instead of relying on real frame timing.
 *
 * Angular's own ChangeDetectionSchedulerImpl also schedules and cancels its own rAF callbacks
 * (a per-id map, matching the real browser API) — a naive single-slot mock that just nulls out
 * "the" queued callback on any cancelAnimationFrame() call ends up wiping out the component's
 * own pending frame when Angular cancels its unrelated one. Tracking by id avoids that.
 */
function mockRaf() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    const id = nextId;
    nextId += 1;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    pending.delete(id);
  });
  return {
    step(now: number): void {
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const cb of callbacks) {
        cb(now);
      }
    },
  };
}

function mockMatchMedia(reducedMotion: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Parses the `translate(calc(-50% + Xpx), calc(-50% + Ypx)) ...` transform string this
 * component publishes into its raw {x, y} — lets tests assert on real physics movement without
 * needing to expose the internal simDice array. */
function extractXY(transform: string): { x: number; y: number } {
  const match = transform.match(/calc\(-50% \+ (-?[\d.]+)px\), calc\(-50% \+ (-?[\d.]+)px\)/);
  return { x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) };
}

function render(inputs: {
  isOwner?: boolean;
  diceCount: number;
  dice?: readonly DiceValue[] | null;
  isRolling?: boolean;
}) {
  const fixture = TestBed.createComponent(DiceCup);
  fixture.componentRef.setInput('diceCount', inputs.diceCount);
  fixture.componentRef.setInput('isOwner', inputs.isOwner ?? false);
  fixture.componentRef.setInput('dice', inputs.dice ?? null);
  fixture.componentRef.setInput('isRolling', inputs.isRolling ?? false);
  fixture.detectChanges();
  return {
    fixture,
    instance: fixture.componentInstance as unknown as {
      dieViews(): readonly {
        transform: string;
        face: DiceValue;
        opacity: number;
        zIndex: number;
      }[];
    },
    nativeElement: fixture.nativeElement as HTMLElement,
  };
}

describe('DiceCup', () => {
  let raf: ReturnType<typeof mockRaf>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DiceCup] });
    raf = mockRaf();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the open top-down cup with the actual dice for the owner once dealt', () => {
    const { nativeElement, instance } = render({ isOwner: true, diceCount: 3, dice: [2, 4, 6] });
    expect(nativeElement.querySelectorAll('app-die')).toHaveLength(3);
    const faces = instance.dieViews().map((v) => v.face);
    expect(faces.sort()).toEqual([2, 4, 6]);
  });

  it('shows no dice at all for the owner before anything has been dealt', () => {
    const { nativeElement } = render({ isOwner: true, diceCount: 5, dice: null });
    expect(nativeElement.querySelectorAll('app-die')).toHaveLength(0);
  });

  it('renders a closed cup for an opponent, never a die-face component or value', () => {
    const { nativeElement } = render({ isOwner: false, diceCount: 5 });
    expect(nativeElement.querySelectorAll('app-die')).toHaveLength(0);
    expect(nativeElement.textContent).toContain('5');
  });

  it('never reveals opponent dice even while the opponent is rolling', () => {
    const { nativeElement } = render({ isOwner: false, diceCount: 5, isRolling: true });
    expect(nativeElement.querySelectorAll('app-die')).toHaveLength(0);
  });

  it('does not animate for an opponent even if a "dice" value were somehow provided', () => {
    // Defense in depth: an opponent's own dice should never even be passed in by SeatCard, but
    // if it were, the closed view must still never render a face.
    const { nativeElement } = render({ isOwner: false, diceCount: 5, dice: [1, 2, 3, 4, 5] });
    expect(nativeElement.querySelectorAll('app-die')).toHaveLength(0);
  });

  it('uses the fixed, readable configured table die size regardless of cup size', () => {
    const { nativeElement } = render({ isOwner: true, diceCount: 5, dice: [1, 2, 3, 4, 5] });
    const wrapper = nativeElement.querySelector('app-die')?.parentElement;
    expect(wrapper?.style.width).toBe(`${DIE_SIZE_PX.table}px`);
  });

  it('starts the shake animation the moment isRolling rises for the owner', () => {
    const { fixture, instance } = render({ isOwner: true, diceCount: 5, isRolling: false });
    expect(instance.dieViews()).toEqual([]);

    fixture.componentRef.setInput('isRolling', true);
    fixture.detectChanges();

    expect(instance.dieViews()).toHaveLength(5);
    // Mid-shake, positions are physics-driven (non-trivial transforms), not a static layout.
    for (const view of instance.dieViews()) {
      expect(view.transform).toContain('translate');
    }
  });

  it('does not restart the shake on every change-detection cycle — only on the rising edge', () => {
    const { fixture, instance } = render({ isOwner: true, diceCount: 5, isRolling: true });
    const firstFrame = instance.dieViews();
    fixture.detectChanges();
    fixture.detectChanges();
    // Same object reference: the effect didn't re-trigger beginShake() and reset state.
    expect(instance.dieViews()).toBe(firstFrame);
  });

  it('moves dice a clearly visible distance during the chaotic phase', () => {
    const { instance } = render({ isOwner: true, diceCount: 5, isRolling: true });
    const startPositions = instance.dieViews().map((v) => extractXY(v.transform));

    // Step forward well within the chaotic window (950-1200ms) so this is still active shuffle.
    let now = 0;
    for (let i = 0; i < 8; i += 1) {
      now += 60;
      raf.step(now);
    }
    const midPositions = instance.dieViews().map((v) => extractXY(v.transform));

    const maxDisplacement = Math.max(
      ...startPositions.map((start, i) => {
        const mid = midPositions[i];
        return Math.hypot(mid.x - start.x, mid.y - start.y);
      }),
    );
    // At least one die must have travelled a clearly visible distance, not a barely-perceptible
    // few pixels — this is the core complaint the bigger impulses/lower damping fix.
    expect(maxDisplacement).toBeGreaterThan(15);
  });

  it('settles to exactly the authoritative dice after the shake plays out', () => {
    const { fixture, instance } = render({
      isOwner: true,
      diceCount: 4,
      isRolling: true,
      dice: null,
    });
    expect(instance.dieViews()).toHaveLength(4);

    // Advance well past the worst-case chaotic+energyLoss+settle duration (about 1.9s) in a few
    // large steps — the physics integration itself uses a capped internal dt, so a big raw frame
    // delta here is safe and simply fast-forwards phase transitions.
    let now = 0;
    for (let i = 0; i < 6; i += 1) {
      now += 500;
      raf.step(now);
    }
    // Server dice arrive only now (simulating network latency past the cosmetic shake window).
    fixture.componentRef.setInput('dice', [3, 3, 6, 1]);
    fixture.detectChanges();
    raf.step(now + 100);

    const faces = instance.dieViews().map((v) => v.face);
    expect(faces).toEqual([3, 3, 6, 1]);
  });

  it('settled positions are clearly separated (no overlap) once the shake finishes', () => {
    const { fixture, instance } = render({
      isOwner: true,
      diceCount: 5,
      isRolling: true,
      dice: null,
    });
    let now = 0;
    for (let i = 0; i < 6; i += 1) {
      now += 500;
      raf.step(now);
    }
    fixture.componentRef.setInput('dice', [1, 2, 3, 4, 5]);
    fixture.detectChanges();
    raf.step(now + 100);

    const positions = instance.dieViews().map((v) => extractXY(v.transform));
    const minRequiredSeparation = DIE_SIZE_PX.table; // 2 * halfSize + gap, roughly the die size
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i];
        const b = positions[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist).toBeGreaterThanOrEqual(minRequiredSeparation - 2); // small float tolerance
      }
    }
  });

  it('does a calm settle (no chaotic shake) when dice arrive without isRolling ever being set', () => {
    const { instance } = render({ isOwner: true, diceCount: 2, isRolling: false, dice: [5, 2] });
    const faces = instance.dieViews().map((v) => v.face);
    expect(faces).toEqual([5, 2]);
  });

  it('clears the settled dice once the server resets the hand for a new round (does not linger)', () => {
    // Round 1: hand auto-dealt and settled (5 dice visible).
    const { fixture, instance } = render({
      isOwner: true,
      diceCount: 5,
      isRolling: false,
      dice: [1, 2, 3, 4, 5],
    });
    expect(instance.dieViews()).toHaveLength(5);

    // Round 2 starts: the server clears this player's hand back to an empty array (exactly what
    // finishRoundAfterLoss does) until they roll again — the cup must not keep showing the
    // previous round's dice.
    fixture.componentRef.setInput('dice', []);
    fixture.detectChanges();
    expect(instance.dieViews()).toEqual([]);
  });

  it('uses a short restrained settle instead of the chaotic shake under prefers-reduced-motion', () => {
    mockMatchMedia(true);
    const { fixture, instance } = render({
      isOwner: true,
      diceCount: 3,
      isRolling: true,
      dice: null,
    });
    const startPositions = instance.dieViews().map((v) => extractXY(v.transform));

    // A single small step: under full chaotic motion this would already show large, energetic
    // displacement (per the "moves a clearly visible distance" test); under reduced motion the
    // step should instead be a gentle ease, and the whole thing must finish well before the
    // normal ~1.9s worst case.
    raf.step(100);
    const afterOneStep = instance.dieViews().map((v) => extractXY(v.transform));
    const displacement = Math.max(
      ...startPositions.map((start, i) => {
        const p = afterOneStep[i];
        return Math.hypot(p.x - start.x, p.y - start.y);
      }),
    );
    expect(displacement).toBeLessThan(15);

    // Provide the server result and confirm it settles (finishes) quickly, well under the full
    // shake's minimum ~1.5s.
    fixture.componentRef.setInput('dice', [4, 4, 4]);
    fixture.detectChanges();
    raf.step(300);
    raf.step(600);
    expect(instance.dieViews().map((v) => v.face)).toEqual([4, 4, 4]);
  });
});
