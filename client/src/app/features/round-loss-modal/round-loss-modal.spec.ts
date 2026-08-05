import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { ServerEvent } from '@shared';
import { GameStore } from '../../core/game-store';
import { RoundLossModal } from './round-loss-modal';

type RoundRevealedEvent = Extract<ServerEvent, { type: 'ROUND_REVEALED' }>;

function reveal(overrides: Partial<RoundRevealedEvent> = {}): RoundRevealedEvent {
  return {
    type: 'ROUND_REVEALED',
    dice: {},
    claimedBid: { kind: 'NORMAL', quantity: 3, face: 4 },
    bidderId: 'p1',
    actualQuantity: 2,
    outcome: 'BIDDER_LOSES',
    loserId: 'p1',
    ...overrides,
  };
}

function setup() {
  const fixture = TestBed.createComponent(RoundLossModal);
  const store = TestBed.inject(GameStore);
  return { fixture, store, instance: fixture.componentInstance };
}

describe('RoundLossModal', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RoundLossModal] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens for the local player when they are the reveal loser', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1' }));
    fixture.detectChanges();

    expect(instance['isOpen']()).toBe(true);
  });

  it('does not open for the winner/opponent when someone else is the loser', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p2');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1' }));
    fixture.detectChanges();

    expect(instance['isOpen']()).toBe(false);
  });

  // IonModal only stamps its <ng-template> content into the DOM once the real Stencil
  // ion-modal element fires 'ionMount' (part of its overlay present/animate lifecycle), which
  // doesn't happen in this jsdom test environment — so content is verified against the
  // component's own derived signals (exactly what the template binds to), not scraped DOM text.
  // The manual two-browser verification step covers the actual rendered appearance.
  it('derives the caller-lost reason when outcome is CALLER_LOSES', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1', outcome: 'CALLER_LOSES', actualQuantity: 7 }));
    fixture.detectChanges();

    expect(instance['lostBecauseBidWasTrue']()).toBe(true);
    expect(instance['actualQuantity']()).toBe(7);
  });

  it('derives the bidder-lost reason when outcome is BIDDER_LOSES', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1', outcome: 'BIDDER_LOSES' }));
    fixture.detectChanges();

    expect(instance['lostBecauseBidWasTrue']()).toBe(false);
  });

  it('exposes the claimed bid for the visual bid marker binding', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    const claimed = { kind: 'NORMAL' as const, quantity: 5, face: 6 as const };
    store.lastReveal.set(reveal({ loserId: 'p1', claimedBid: claimed }));
    fixture.detectChanges();

    expect(instance['claimedBid']()).toEqual(claimed);
  });

  it('closes manually via the Close button and clears the auto-close timer', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1' }));
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(true);

    instance['close']();
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(false);

    // Advancing past the auto-close window must not throw or do anything surprising now that
    // the timer was already cleared by the manual close.
    vi.advanceTimersByTime(6000);
    expect(instance['isOpen']()).toBe(false);
  });

  it('auto-dismisses after 5 seconds without a manual close', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1' }));
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(instance['isOpen']()).toBe(false);
  });

  it('does not reopen for the same reveal after a manual close, even once it is seen again', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    const firstReveal = reveal({ loserId: 'p1' });
    store.lastReveal.set(firstReveal);
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(true);

    instance['close']();
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(false);

    // The store signal churns (e.g. nulled then set back to the very same reveal reference) —
    // the modal must not treat that as a fresh loss.
    store.lastReveal.set(null);
    fixture.detectChanges();
    store.lastReveal.set(firstReveal);
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(false);
  });

  it('opens again for a genuinely new reveal after a previous one was dismissed', () => {
    const { fixture, store, instance } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1' }));
    fixture.detectChanges();
    instance['close']();
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(false);

    store.lastReveal.set(reveal({ loserId: 'p1', actualQuantity: 9 }));
    fixture.detectChanges();
    expect(instance['isOpen']()).toBe(true);
  });

  it('clears the auto-close timeout on component destruction', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { fixture, store } = setup();
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1' }));
    fixture.detectChanges();

    fixture.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });
});
