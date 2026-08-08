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
});
