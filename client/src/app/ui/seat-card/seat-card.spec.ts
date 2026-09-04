import { TestBed } from '@angular/core/testing';
import { normalBid, type Player } from '@shared';
import { CARD_WIDTH_PX, SeatCard } from './seat-card';

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    nickname: 'Alice',
    isReady: true,
    diceCount: 5,
    dice: [],
    consecutivePureStalls: 0,
    eliminatedInRound: null,
    ...overrides,
  };
}

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(SeatCard);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  const nativeElement = fixture.nativeElement as HTMLElement;
  return { fixture, nativeElement, text: nativeElement.textContent ?? '' };
}

describe('SeatCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SeatCard] });
  });

  it('shows "Hand rolled" when handRollStatus is rolled', () => {
    const { text } = render({ player: player(), handRollStatus: 'rolled' });
    expect(text).toContain('Hand rolled');
    expect(text).not.toContain('Waiting to roll');
  });

  it('shows "Waiting to roll" when handRollStatus is waiting', () => {
    const { text } = render({ player: player(), handRollStatus: 'waiting' });
    expect(text).toContain('Waiting to roll');
    expect(text).not.toContain('Hand rolled');
  });

  it('shows neither badge when handRollStatus is null (not in ROUND_ROLLING)', () => {
    const { text } = render({ player: player(), handRollStatus: null });
    expect(text).not.toContain('Hand rolled');
    expect(text).not.toContain('Waiting to roll');
  });

  it('renders no bid marker when currentBid is null', () => {
    const { nativeElement } = render({ player: player(), currentBid: null });
    expect(nativeElement.querySelector('app-bid-marker')).toBeNull();
  });

  it('renders the bid marker inline, between the nickname and the dice cup (never a floating overlay)', () => {
    const { nativeElement } = render({ player: player(), currentBid: normalBid(4, 5) });
    const marker = nativeElement.querySelector('app-bid-marker');
    const cup = nativeElement.querySelector('app-dice-cup');
    expect(marker).toBeTruthy();
    expect(marker?.textContent ?? '').toContain('4');
    // It must sit in the card's own document flow (no inline positioning styles) and come before
    // the dice cup in DOM order — never absolutely positioned on top of the nickname/cup/badges.
    expect(marker?.getAttribute('style')).toBeNull();
    expect(
      marker !== null &&
        cup !== null &&
        !!(marker.compareDocumentPosition(cup as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('is at least as wide as a large opponent card before the local player has rolled anything', () => {
    const { nativeElement } = render({ player: player({ dice: [] }), isMe: true });
    const card = nativeElement.querySelector('div');
    expect(card).toBeTruthy();
    const minWidth = parseFloat(card?.style.minWidth ?? '0');
    expect(minWidth).toBeGreaterThanOrEqual(CARD_WIDTH_PX.large);
  });

  it('does not apply a min-width floor to opponent cards (they use the fixed size tiers)', () => {
    const { nativeElement } = render({ player: player(), isMe: false, size: 'large' });
    const card = nativeElement.querySelector('div');
    expect(card?.style.minWidth).toBe('');
  });
});
