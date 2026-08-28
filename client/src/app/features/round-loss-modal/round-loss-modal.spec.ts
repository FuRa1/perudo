import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type ServerEvent, type StateSnapshot } from '@shared';
import { GameStore } from '../../core/game-store';
import { VISUAL_ASSETS_CONFIG } from '../../ui/visual-assets/visual-assets.config';
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

function gameOverState(winnerId: string): StateSnapshot {
  return {
    phase: GamePhase.GAME_OVER,
    roomId: 'room-1',
    players: [],
    startRoll: null,
    completedStartRoll: null,
    round: null,
    winnerId,
    turnTimer: null,
  };
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

  // Regression: once presented, Ionic's <ion-modal> relocates its rendered overlay outside this
  // component's own DOM subtree (to document.body in a real browser) — an ordinary Angular
  // component teardown does not reach it, so it must be force-removed via a direct element
  // reference in the destroy hook. An earlier version of that hook read the wrong viewChild
  // result (the IonModal component instance instead of its ElementRef), which crashed on
  // `.nativeElement.remove()` the moment the parent tore this component down while a modal was
  // open — exactly the GAME_OVER-during-an-open-modal case this component exists to handle.
  it('does not throw when destroyed while open, and removes the modal element from the DOM', () => {
    const { fixture, store } = setup();
    const nativeElement = fixture.nativeElement as HTMLElement;
    store.playerId.set('p1');
    fixture.detectChanges();
    store.lastReveal.set(reveal({ loserId: 'p1' }));
    fixture.detectChanges();
    expect(nativeElement.querySelector('ion-modal')).not.toBeNull();

    expect(() => fixture.destroy()).not.toThrow();
    expect(nativeElement.querySelector('ion-modal')).toBeNull();
  });

  // GAME_OVER always wins over a still-open round-loss notification (terminal-state
  // correction): the server sends 'events' (ROUND_REVEALED) before 'state' for the same batch
  // (game.gateway.ts), so a loss that also eliminates the player and ends the match is briefly
  // seen by this component before GameStore's matchState reports GAME_OVER — the modal must
  // never end up covering the winner screen either way that lands.
  describe('terminal-state correction (GAME_OVER)', () => {
    it('does not open for a loss reveal that arrives once the match is already GAME_OVER', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      store.setState(gameOverState('p2'));
      fixture.detectChanges();

      store.lastReveal.set(reveal({ loserId: 'p1' }));
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(false);
    });

    it('closes immediately if the match ends while the modal is already open (the loss reveal arrived before the GAME_OVER state update)', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      fixture.detectChanges();
      store.lastReveal.set(reveal({ loserId: 'p1' }));
      fixture.detectChanges();
      expect(instance['isOpen']()).toBe(true);

      // The 'state' update reporting GAME_OVER lands after the 'events' update already opened
      // the modal — it must be force-closed rather than left covering the winner screen.
      store.setState(gameOverState('p2'));
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(false);
    });

    it('a normal, non-terminal round loss still shows the modal as before', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      store.setState({
        phase: GamePhase.BIDDING,
        roomId: 'room-1',
        players: [],
        startRoll: null,
        completedStartRoll: null,
        round: null,
        winnerId: null,
        turnTimer: null,
      });
      fixture.detectChanges();

      store.lastReveal.set(reveal({ loserId: 'p1' }));
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(true);
    });
  });

  // IonModal doesn't stamp its <ng-template> content into jsdom (see the note above on the
  // CALLER_LOSES test) — so, like the rest of this file, this checks the field the template's
  // `@if (badgeImageUrl; as imageUrl)` actually binds to, not the DOM inside the modal.
  // A pure timeout stall (5.7) has no reveal at all — without this, a player who simply ran out
  // of time gets zero feedback that they lost a die and why.
  describe('timeout loss notification (5.7)', () => {
    it('opens for the local player when their own turn timed out and cost them a die', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      fixture.detectChanges();
      store.lastTimeout.set({ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: true });
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(true);
      expect(instance['isTimeoutLoss']()).toBe(true);
    });

    it('does not open for another player timing out', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p2');
      fixture.detectChanges();
      store.lastTimeout.set({ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: true });
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(false);
    });

    it('auto-dismisses after 5 seconds, same as a reveal loss', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      fixture.detectChanges();
      store.lastTimeout.set({ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: true });
      fixture.detectChanges();
      expect(instance['isOpen']()).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(instance['isOpen']()).toBe(false);
    });

    it('does not reopen for the same timeout event after a manual close', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      fixture.detectChanges();
      const timeout = { type: 'TURN_TIMED_OUT' as const, playerId: 'p1', dieLost: true };
      store.lastTimeout.set(timeout);
      fixture.detectChanges();
      instance['close']();
      fixture.detectChanges();

      store.lastTimeout.set(null);
      fixture.detectChanges();
      store.lastTimeout.set(timeout);
      fixture.detectChanges();
      expect(instance['isOpen']()).toBe(false);
    });

    it('a reveal loss after a shown timeout loss switches the modal back to the reveal branch', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      fixture.detectChanges();
      store.lastTimeout.set({ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: true });
      fixture.detectChanges();
      expect(instance['isTimeoutLoss']()).toBe(true);

      store.lastReveal.set(reveal({ loserId: 'p1' }));
      fixture.detectChanges();
      expect(instance['isTimeoutLoss']()).toBe(false);
    });

    it('does not open for a timeout that arrives once the match is already GAME_OVER', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      store.setState(gameOverState('p2'));
      fixture.detectChanges();

      store.lastTimeout.set({ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: true });
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(false);
    });
  });

  describe('outcome badge (decor/badge-lost.png)', () => {
    it('is configured with the real badge image by default', () => {
      const { instance } = setup();
      expect(instance['badgeImageUrl']).toContain('/assets/decor/badge-lost.png');
    });

    it('falls back to undefined (CSS dashed-roundel placeholder) when no badge asset is configured', () => {
      const original = VISUAL_ASSETS_CONFIG.badgeLost.imageUrl;
      (VISUAL_ASSETS_CONFIG.badgeLost as { imageUrl?: string }).imageUrl = undefined;
      try {
        const { instance } = setup();
        expect(instance['badgeImageUrl']).toBeUndefined();
      } finally {
        (VISUAL_ASSETS_CONFIG.badgeLost as { imageUrl?: string }).imageUrl = original;
      }
    });
  });
});
