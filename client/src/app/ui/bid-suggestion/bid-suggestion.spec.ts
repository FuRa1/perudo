import { TestBed } from '@angular/core/testing';
import { normalBid } from '@shared';
import { BidSuggestion } from './bid-suggestion';

function getButton(fixture: { nativeElement: unknown }): HTMLButtonElement {
  const nativeElement = fixture.nativeElement as HTMLElement;
  const button = nativeElement.querySelector('button');
  if (!button) {
    throw new Error('Expected a <button> in the rendered template');
  }
  return button;
}

describe('BidSuggestion', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BidSuggestion] });
  });

  it('submits exactly the suggested bid when clicked', () => {
    const bid = normalBid(4, 3);
    const fixture = TestBed.createComponent(BidSuggestion);
    fixture.componentRef.setInput('label', 'Minimum');
    fixture.componentRef.setInput('bid', bid);
    fixture.detectChanges();

    const emitted: unknown[] = [];
    fixture.componentInstance.bidSelected.subscribe((b) => emitted.push(b));

    const button = getButton(fixture);
    expect(button.disabled).toBe(false);
    button.click();

    expect(emitted).toEqual([bid]);
  });

  it('renders an available suggestion with solid, non-faded text (no opacity-based fade)', () => {
    const fixture = TestBed.createComponent(BidSuggestion);
    fixture.componentRef.setInput('label', 'Minimum');
    fixture.componentRef.setInput('bid', normalBid(4, 3));
    fixture.detectChanges();

    const button = getButton(fixture);
    expect(button.className).toContain('text-ink');
    expect(button.className).not.toContain('opacity-40');
  });

  it("does not submit when disabled (e.g. not the player's turn)", () => {
    const bid = normalBid(4, 3);
    const fixture = TestBed.createComponent(BidSuggestion);
    fixture.componentRef.setInput('label', 'Minimum');
    fixture.componentRef.setInput('bid', bid);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const emitted: unknown[] = [];
    fixture.componentInstance.bidSelected.subscribe((b) => emitted.push(b));

    const button = getButton(fixture);
    expect(button.disabled).toBe(true);
    button.click();

    expect(emitted).toEqual([]);
    // Disabled must stay legible — a solid muted palette, not a near-transparent fade of the
    // enabled text color against the same parchment-toned background.
    expect(button.className).toContain('disabled:text-wood');
    expect(button.className).not.toContain('opacity-40');
  });

  it('does not submit when no suggestion is available (bid is null)', () => {
    const fixture = TestBed.createComponent(BidSuggestion);
    fixture.componentRef.setInput('label', 'Switch to aces');
    fixture.componentRef.setInput('bid', null);
    fixture.detectChanges();

    const emitted: unknown[] = [];
    fixture.componentInstance.bidSelected.subscribe((b) => emitted.push(b));

    const button = getButton(fixture);
    expect(button.disabled).toBe(true);
    button.click();

    expect(emitted).toEqual([]);
    expect(button.textContent).toContain('unavailable');
  });
});
