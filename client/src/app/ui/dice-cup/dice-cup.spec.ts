import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DiceValue } from '@shared';
import { DIE_SIZE_PX } from '../die/die-size.config';
import { DiceCup } from './dice-cup';

/**
 * Real browsers deliver the first ResizeObserver callback asynchronously, after the initial
 * synchronous render/effects have already run — never inline during `observe()`. This fake
 * preserves that: `report()` must be called explicitly by the test to simulate the callback
 * landing later.
 */
function mockResizeObserver(): { report(px: number): void } {
  let callback: ResizeObserverCallback | null = null;
  class FakeResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      callback = cb;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return {
    report(px: number): void {
      const entry = { contentRect: { width: px, height: px } } as ResizeObserverEntry;
      callback?.([entry], {} as ResizeObserver);
    },
  };
}

/** Parses the `translate(calc(-50% + Xpx), calc(-50% + Ypx))` transform string this component
 * publishes into its raw {x, y}. */
function extractXY(transform: string): { x: number; y: number } {
  const match = transform.match(/calc\(-50% \+ (-?[\d.]+)px\), calc\(-50% \+ (-?[\d.]+)px\)/);
  return { x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) };
}

function render(inputs: {
  isOwner?: boolean;
  diceCount: number;
  dice?: readonly DiceValue[] | null;
}) {
  const fixture = TestBed.createComponent(DiceCup);
  fixture.componentRef.setInput('diceCount', inputs.diceCount);
  fixture.componentRef.setInput('isOwner', inputs.isOwner ?? false);
  fixture.componentRef.setInput('dice', inputs.dice ?? null);
  fixture.detectChanges();
  return {
    fixture,
    instance: fixture.componentInstance as unknown as {
      dieViews(): readonly { transform: string; face: DiceValue }[];
    },
    nativeElement: fixture.nativeElement as HTMLElement,
  };
}

describe('DiceCup', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DiceCup] });
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

  it('shows no dice at all for the owner before anything has been dealt (empty/open cup state)', () => {
    const { nativeElement, instance } = render({ isOwner: true, diceCount: 5, dice: null });
    expect(nativeElement.querySelectorAll('app-die')).toHaveLength(0);
    expect(instance.dieViews()).toEqual([]);
  });

  it('renders a closed cup for an opponent, never a die-face component or value', () => {
    const { nativeElement } = render({ isOwner: false, diceCount: 5 });
    expect(nativeElement.querySelectorAll('app-die')).toHaveLength(0);
    expect(nativeElement.textContent).toContain('5');
  });

  it('does not reveal an opponent even if a "dice" value were somehow provided', () => {
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

  it('lays out the settled hand in clearly separated (non-overlapping) positions', () => {
    const { instance } = render({ isOwner: true, diceCount: 5, dice: [1, 2, 3, 4, 5] });
    const positions = instance.dieViews().map((v) => extractXY(v.transform));
    const minRequiredSeparation = DIE_SIZE_PX.table;
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i];
        const b = positions[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist).toBeGreaterThanOrEqual(minRequiredSeparation - 2);
      }
    }
  });

  it('clears the shown dice once the server resets the hand for a new round (does not linger)', () => {
    const { fixture, instance } = render({ isOwner: true, diceCount: 5, dice: [1, 2, 3, 4, 5] });
    expect(instance.dieViews()).toHaveLength(5);

    // The server clears this player's hand back to an empty array (finishRoundAfterLoss) until
    // they roll again — the cup must not keep showing the previous round's dice.
    fixture.componentRef.setInput('dice', []);
    fixture.detectChanges();
    expect(instance.dieViews()).toEqual([]);
  });

  it(
    'keeps all 5 dice inside the cup once the real measured size arrives, even though it was ' +
      'smaller than the fallback used at first render',
    () => {
      const ro = mockResizeObserver();
      const { fixture, instance, nativeElement } = render({
        isOwner: true,
        diceCount: 5,
        dice: [1, 2, 3, 4, 5],
      });
      // At this point ResizeObserver hasn't reported yet (its callback is always asynchronous in
      // a real browser), so the layout above used the guessed 230px fallback.
      expect(nativeElement.querySelectorAll('app-die')).toHaveLength(5);

      // The real measured size now lands — much smaller than the fallback, as it would be on a
      // squeezed/narrow layout. Every die must still end up inside the ACTUAL bowl.
      const realSizePx = 120;
      ro.report(realSizePx);
      fixture.detectChanges();

      expect(nativeElement.querySelectorAll('app-die')).toHaveLength(5);
      expect(instance.dieViews()).toHaveLength(5);

      const dieHalfSize = DIE_SIZE_PX.table / 2;
      const usableRx = (realSizePx / 2) * 0.82 - dieHalfSize;
      const usableRy = (realSizePx / 2) * 0.76 - dieHalfSize;
      for (const view of instance.dieViews()) {
        const { x, y } = extractXY(view.transform);
        expect(
          (x * x) / (usableRx * usableRx) + (y * y) / (usableRy * usableRy),
        ).toBeLessThanOrEqual(1 + 1e-6);
      }
    },
  );
});
