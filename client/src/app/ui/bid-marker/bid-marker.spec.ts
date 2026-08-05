import { TestBed } from '@angular/core/testing';
import { aceBid, normalBid } from '@shared';
import { BidMarker } from './bid-marker';

function render(bid: ReturnType<typeof normalBid> | ReturnType<typeof aceBid>) {
  const fixture = TestBed.createComponent(BidMarker);
  fixture.componentRef.setInput('bid', bid);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('BidMarker', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BidMarker] });
  });

  it('renders the quantity, a multiplication sign, and the die face for a normal bid', () => {
    const el = render(normalBid(4, 5));
    expect(el.textContent).toContain('4');
    expect(el.textContent).toContain('×');
    // The value is rendered via <app-die>, not as bare "face 5" text.
    expect(el.querySelector('app-die')).toBeTruthy();
    expect(el.textContent).not.toContain('face 5');
  });

  it('maps an ace bid to die face 1', () => {
    const el = render(aceBid(3));
    expect(el.querySelector('app-die')).toBeTruthy();
    expect(el.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
      'Current bid: 3 of face 1',
    );
  });

  it('exposes an accessible label describing the claim', () => {
    const el = render(normalBid(3, 4));
    const marker = el.querySelector('[role="status"]');
    expect(marker?.getAttribute('aria-label')).toBe('Current bid: 3 of face 4');
  });
});
