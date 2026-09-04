import { TestBed } from '@angular/core/testing';
import type { Player } from '@shared';
import { ArcSeat } from './arc-seat';

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    nickname: 'Alice',
    isReady: true,
    diceCount: 5,
    dice: [],
    consecutivePureStalls: 0,
    ...overrides,
  };
}

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(ArcSeat);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  const nativeElement = fixture.nativeElement as HTMLElement;
  return { fixture, nativeElement, text: nativeElement.textContent ?? '' };
}

describe('ArcSeat', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ArcSeat] });
  });

  it('never renders an Ionic "Bidding" badge, even for the current bidder (mobile turn state is a ring, not a badge)', () => {
    const { nativeElement, text } = render({ player: player(), isCurrentBidder: true });
    expect(nativeElement.querySelector('ion-badge')).toBeNull();
    expect(text).not.toContain('Bidding');
  });

  it('applies the active seat class for the current bidder', () => {
    const { nativeElement } = render({ player: player(), isCurrentBidder: true });
    expect(nativeElement.querySelector('.arc-seat--active')).not.toBeNull();
  });

  it('shows "out" once the player has no dice left', () => {
    const { text } = render({ player: player({ diceCount: 0 }) });
    expect(text).toContain('out');
  });

  it('renders one dice dot per remaining die — the only place the mobile board shows an opponent’s dice count', () => {
    const { nativeElement } = render({ player: player({ diceCount: 3 }) });
    expect(nativeElement.querySelectorAll('.arc-seat__dot')).toHaveLength(3);
  });

  it('exposes the dice count as text for assistive tech, since a row of bare dots reads as nothing', () => {
    const { nativeElement } = render({ player: player({ diceCount: 2 }) });
    expect(nativeElement.querySelector('.arc-seat__dots')?.getAttribute('aria-label')).toBe(
      '2 dice remaining',
    );
  });

  it('renders no dots at all for an eliminated seat (the dashed tile and struck-through name carry that state)', () => {
    const { nativeElement } = render({ player: player({ diceCount: 0 }) });
    expect(nativeElement.querySelector('.arc-seat__dots')).toBeNull();
  });

  it('shows the "Bid placed" pill for the seat holding the standing wager', () => {
    const { nativeElement, text } = render({ player: player(), hasStandingBid: true });
    expect(nativeElement.querySelector('.arc-seat__bid-pill')).not.toBeNull();
    expect(text).toContain('Bid placed');
  });

  it('prefers the standing-wager pill over a stale hand-roll status in the same single status slot', () => {
    const { nativeElement, text } = render({
      player: player(),
      hasStandingBid: true,
      handRollStatus: 'rolled',
    });
    expect(nativeElement.querySelectorAll('.arc-seat__bid-pill')).toHaveLength(1);
    expect(text).not.toContain('rolled');
  });

  it('never shows the standing-wager pill on an eliminated seat', () => {
    const { nativeElement, text } = render({
      player: player({ diceCount: 0 }),
      hasStandingBid: true,
    });
    expect(nativeElement.querySelector('.arc-seat__bid-pill')).toBeNull();
    expect(text).toContain('out');
  });

  it('shows a compact hand-roll status without a large badge or progress bar', () => {
    const { text, nativeElement } = render({ player: player(), handRollStatus: 'rolled' });
    expect(text).toContain('rolled');
    expect(nativeElement.querySelector('ion-badge')).toBeNull();
    expect(nativeElement.querySelector('progress')).toBeNull();
  });

  it('reserves the opening-roll die slot while waiting (no die rendered yet)', () => {
    const { nativeElement } = render({
      player: player(),
      openingRoll: { value: null, isWinner: false },
    });
    expect(nativeElement.querySelector('.arc-seat__die-slot')).not.toBeNull();
    expect(nativeElement.querySelector('app-die')).toBeNull();
  });

  it('replaces the dashed slot with the public die in place once rolled', () => {
    const { nativeElement } = render({
      player: player(),
      openingRoll: { value: 4, isWinner: false },
    });
    expect(nativeElement.querySelector('app-die')).not.toBeNull();
  });

  it('highlights the opening-roll winner with the winner slot variant', () => {
    const { nativeElement } = render({
      player: player(),
      openingRoll: { value: 5, isWinner: true },
    });
    expect(nativeElement.querySelector('.arc-seat__die-slot--winner')).not.toBeNull();
  });

  it('does not show a hand-roll status while an opening roll is in progress (die slot takes priority)', () => {
    const { text } = render({
      player: player(),
      handRollStatus: 'waiting',
      openingRoll: { value: null, isWinner: false },
    });
    expect(text).not.toContain('waiting');
  });

  describe('9-12 player stress case (5.)', () => {
    it('applies the compact class for the two-arc layout', () => {
      const { nativeElement } = render({ player: player(), compact: true });
      expect(nativeElement.querySelector('.arc-seat--compact')).not.toBeNull();
    });

    it('applies the subdued class for the inset back row', () => {
      const { nativeElement } = render({ player: player(), subdued: true });
      expect(nativeElement.querySelector('.arc-seat--subdued')).not.toBeNull();
    });

    it('keeps an eliminated seat looking eliminated even when it is also in the subdued back row', () => {
      const { nativeElement, text } = render({
        player: player({ diceCount: 0 }),
        subdued: true,
      });
      expect(nativeElement.querySelector('.arc-seat--eliminated')).not.toBeNull();
      expect(text).toContain('out');
    });
  });
});
