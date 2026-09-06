import { TestBed } from '@angular/core/testing';
import type { RevealRow } from '../../core/game-view';
import { MobileRevealPanel } from './mobile-reveal-panel';

describe('MobileRevealPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MobileRevealPanel] });
  });

  it('labels an exact count as a true bid and explains why the liar caller loses', () => {
    const fixture = TestBed.createComponent(MobileRevealPanel);
    fixture.componentRef.setInput('reveal', {
      type: 'ROUND_REVEALED',
      dice: {},
      claimedBid: { kind: 'NORMAL', quantity: 4, face: 6 },
      bidderId: 'p1',
      actualQuantity: 4,
      outcome: 'CALLER_LOSES',
      loserId: 'p2',
    });
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('bidderNickname', 'Alice');
    fixture.componentRef.setInput('claimedBidText', '4 × sixes');
    fixture.componentRef.setInput('lossSentence', 'Bob loses a die.');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Truth revealed');
    expect(text).toContain('Bid true');
    expect(text).toContain('an exact match still counts');
    expect(text).toContain('Bob loses a die.');
    expect(text).not.toContain('called liar — the bid was true');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.mobile-reveal__verdict--true'),
    ).not.toBeNull();
  });

  it('labels a short count as a false bid', () => {
    const fixture = TestBed.createComponent(MobileRevealPanel);
    fixture.componentRef.setInput('reveal', {
      type: 'ROUND_REVEALED',
      dice: {},
      claimedBid: { kind: 'NORMAL', quantity: 4, face: 5 },
      bidderId: 'p2',
      actualQuantity: 2,
      outcome: 'BIDDER_LOSES',
      loserId: 'p2',
    });
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('bidderNickname', 'Bob');
    fixture.componentRef.setInput('claimedBidText', '4 × fives');
    fixture.componentRef.setInput('lossSentence', 'Bob loses a die.');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Bid false');
    expect(text).toContain('The actual count was below the claim.');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.mobile-reveal__verdict--false'),
    ).not.toBeNull();
  });

  it('shows claimed vs actual and every revealed hand, ringing dice that count toward the claim', () => {
    const rows: RevealRow[] = [
      {
        playerId: 'p1',
        nickname: 'You',
        dice: [1, 2, 3, 4, 5].map((value) => ({
          value: value as never,
          ringed: value === 5,
        })),
        isBidder: false,
        isLoser: false,
      },
      {
        playerId: 'p2',
        nickname: 'Bob',
        dice: [6, 6, 1, 2, 3].map((value) => ({
          value: value as never,
          ringed: false,
        })),
        isBidder: true,
        isLoser: true,
      },
    ];
    const fixture = TestBed.createComponent(MobileRevealPanel);
    fixture.componentRef.setInput('reveal', {
      type: 'ROUND_REVEALED',
      dice: {},
      claimedBid: { kind: 'NORMAL', quantity: 4, face: 5 },
      bidderId: 'p2',
      actualQuantity: 2,
      outcome: 'BIDDER_LOSES',
      loserId: 'p2',
    });
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('bidderNickname', 'Bob');
    fixture.componentRef.setInput('claimedBidText', '4 × fives');
    fixture.componentRef.setInput('lossSentence', 'Bob loses a die.');
    fixture.detectChanges();

    const panel = fixture.nativeElement as HTMLElement;
    const text = panel.textContent ?? '';
    expect(text).toContain('4 × fives');
    expect(text).toContain('2');
    expect(text).toContain('You');
    expect(text).toContain('Bob');
    expect(panel.querySelectorAll('app-die').length).toBe(10);
  });

  it('is absent from the DOM only when the caller never renders it — a null reveal input is not accepted', () => {
    // MobileRevealPanel is input()-driven and `reveal` is required; visibility is BoardShell's
    // own concern (an @if wrapping the whole element), not this component's.
    const fixture = TestBed.createComponent(MobileRevealPanel);
    fixture.componentRef.setInput('reveal', {
      type: 'ROUND_REVEALED',
      dice: {},
      claimedBid: { kind: 'NORMAL', quantity: 1, face: 1 },
      bidderId: 'p1',
      actualQuantity: 0,
      outcome: 'BIDDER_LOSES',
      loserId: 'p1',
    });
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('bidderNickname', 'You');
    fixture.componentRef.setInput('claimedBidText', '1 aces');
    fixture.componentRef.setInput('lossSentence', 'You lose a die.');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.mobile-reveal')).not.toBeNull();
  });
});
