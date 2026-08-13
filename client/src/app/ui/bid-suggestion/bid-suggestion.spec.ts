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

  it('renders an available suggestion with the shared button treatment (no opacity-based fade)', () => {
    const fixture = TestBed.createComponent(BidSuggestion);
    fixture.componentRef.setInput('label', 'Minimum');
    fixture.componentRef.setInput('bid', normalBid(4, 3));
    fixture.detectChanges();

    const button = getButton(fixture);
    // Color comes from bid-suggestion.scss's `.bid-suggestion` rule (solid var(--color-cream)),
    // not a toggled utility class — this just confirms that styling hook is present and that
    // there's no opacity-based fade class riding along with it.
    expect(button.className).toContain('bid-suggestion');
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
    // Disabled must stay legible — bid-suggestion.scss's `&:disabled` rule swaps in a solid
    // muted color (var(--color-cream-faint)), never a near-transparent opacity-based fade.
    expect(button.className).not.toContain('opacity-40');
  });

  it('has a touch target at least 44px tall (accessibility floor)', () => {
    const fixture = TestBed.createComponent(BidSuggestion);
    fixture.componentRef.setInput('label', 'Minimum');
    fixture.componentRef.setInput('bid', normalBid(4, 3));
    fixture.detectChanges();

    // min-h-11 is Tailwind's 2.75rem = 44px, enforced regardless of content so the shorter
    // "unavailable" state can't shrink below the same floor.
    expect(getButton(fixture).className).toContain('min-h-11');
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
    // Visible text is the compact "n/a" (5.8: the tray's hint row must fit without wrapping), but
    // the accessible name still spells out "unavailable" in full — never lost, just not shown.
    expect(button.textContent).toContain('n/a');
    expect(button.getAttribute('aria-label')).toContain('unavailable');
  });

  it('shows a compact visible label while keeping the full label in the accessible name', () => {
    const fixture = TestBed.createComponent(BidSuggestion);
    fixture.componentRef.setInput('label', 'Switch to aces');
    fixture.componentRef.setInput('shortLabel', 'Aces');
    fixture.componentRef.setInput('bid', normalBid(2, 4));
    fixture.detectChanges();

    const button = getButton(fixture);
    expect(button.textContent).toContain('Aces:');
    expect(button.textContent).not.toContain('Switch to aces');
    expect(button.getAttribute('aria-label')).toContain('Switch to aces');
  });
});
