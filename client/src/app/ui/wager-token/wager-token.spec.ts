import { TestBed } from '@angular/core/testing';
import { WagerToken } from './wager-token';

describe('WagerToken', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [WagerToken] });
  });

  it('renders the bid marker and the given caption', () => {
    const fixture = TestBed.createComponent(WagerToken);
    fixture.componentRef.setInput('bid', { kind: 'NORMAL', quantity: 4, face: 5 });
    fixture.componentRef.setInput('caption', "Alice's bid — your turn");
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-bid-marker')).not.toBeNull();
    expect(el.querySelector('.mobile-wager-token__caption')?.textContent).toContain(
      "Alice's bid — your turn",
    );
  });

  it('applies the compact modifier class when compact is true', () => {
    const fixture = TestBed.createComponent(WagerToken);
    fixture.componentRef.setInput('bid', { kind: 'NORMAL', quantity: 4, face: 5 });
    fixture.componentRef.setInput('caption', 'Your bid');
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.mobile-wager-token--compact'),
    ).not.toBeNull();
  });
});
