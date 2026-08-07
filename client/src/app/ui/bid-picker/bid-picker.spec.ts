import { TestBed } from '@angular/core/testing';
import { BidPicker } from './bid-picker';

function setup(
  quantity: number,
  face: 1 | 2 | 3 | 4 | 5 | 6,
  disabled = false,
  faceDisabled = false,
) {
  const fixture = TestBed.createComponent(BidPicker);
  fixture.componentRef.setInput('quantity', quantity);
  fixture.componentRef.setInput('face', face);
  fixture.componentRef.setInput('disabled', disabled);
  fixture.componentRef.setInput('faceDisabled', faceDisabled);
  fixture.detectChanges();
  const nativeElement = fixture.nativeElement as HTMLElement;
  const buttons = nativeElement.querySelectorAll('button');
  return {
    fixture,
    quantityUp: buttons[0],
    quantityDown: buttons[1],
    faceUp: buttons[2],
    faceDown: buttons[3],
  };
}

describe('BidPicker', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BidPicker] });
  });

  it('emits an increased quantity when the up arrow is clicked', () => {
    const { fixture, quantityUp } = setup(3, 2);
    const emitted: number[] = [];
    fixture.componentInstance.quantityChange.subscribe((v) => emitted.push(v));
    quantityUp.click();
    expect(emitted).toEqual([4]);
  });

  it('never emits a quantity below 1 — the down arrow is disabled at the floor', () => {
    const { fixture, quantityDown } = setup(1, 2);
    const emitted: number[] = [];
    fixture.componentInstance.quantityChange.subscribe((v) => emitted.push(v));
    expect(quantityDown.disabled).toBe(true);
    quantityDown.click();
    expect(emitted).toEqual([]);
  });

  it('cycles the face forward and wraps from 6 back to 1', () => {
    const { fixture, faceUp } = setup(2, 6);
    const emitted: number[] = [];
    fixture.componentInstance.faceChange.subscribe((v) => emitted.push(v));
    faceUp.click();
    expect(emitted).toEqual([1]);
  });

  it('cycles the face backward and wraps from 1 to 6', () => {
    const { fixture, faceDown } = setup(2, 1);
    const emitted: number[] = [];
    fixture.componentInstance.faceChange.subscribe((v) => emitted.push(v));
    faceDown.click();
    expect(emitted).toEqual([6]);
  });

  it('selects any normal face 2..6 by repeated increments, as the parent feeds each change back', () => {
    // A controlled component: it only reports what changed, it never mutates its own input — the
    // parent (BidControls) re-binds `face` to the emitted value, which is what makes this a
    // realistic simulation rather than clicking against the same stale input every time.
    const { fixture, faceUp } = setup(1, 2);
    const emitted: number[] = [];
    fixture.componentInstance.faceChange.subscribe((v) => {
      emitted.push(v);
      fixture.componentRef.setInput('face', v);
      fixture.detectChanges();
    });
    faceUp.click();
    faceUp.click();
    faceUp.click();
    expect(emitted).toEqual([3, 4, 5]);
  });

  it('locks the face stepper independently of the general disabled state', () => {
    const { fixture, faceUp, quantityUp } = setup(2, 2, false, true);
    const faceEmitted: number[] = [];
    const quantityEmitted: number[] = [];
    fixture.componentInstance.faceChange.subscribe((v) => faceEmitted.push(v));
    fixture.componentInstance.quantityChange.subscribe((v) => quantityEmitted.push(v));
    expect(faceUp.disabled).toBe(true);
    faceUp.click();
    quantityUp.click();
    expect(faceEmitted).toEqual([]);
    expect(quantityEmitted).toEqual([3]);
  });

  it('disables everything and emits nothing when fully disabled', () => {
    const { fixture, quantityUp, faceUp } = setup(2, 2, true);
    const emitted: number[] = [];
    fixture.componentInstance.quantityChange.subscribe((v) => emitted.push(v));
    fixture.componentInstance.faceChange.subscribe((v) => emitted.push(v));
    expect(quantityUp.disabled).toBe(true);
    expect(faceUp.disabled).toBe(true);
    quantityUp.click();
    faceUp.click();
    expect(emitted).toEqual([]);
  });

  it('never dims a disabled stepper via opacity — bid-picker.scss swaps in a solid muted color instead', () => {
    const { quantityUp } = setup(2, 2, true);
    expect(quantityUp.className).not.toContain('opacity-40');
  });

  it('gives every stepper button a touch target at least 44px tall (accessibility floor)', () => {
    const { quantityUp, quantityDown, faceUp, faceDown } = setup(2, 2);
    for (const button of [quantityUp, quantityDown, faceUp, faceDown]) {
      // h-11 is Tailwind's 2.75rem = 44px — the accessibility-mandated minimum touch target.
      expect(button.className).toContain('h-11');
    }
  });
});
