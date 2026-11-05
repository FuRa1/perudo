import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type ServerEvent, type StateSnapshot } from '@shared';
import { GameStore } from '../../core/game-store';
import { VISUAL_ASSETS_CONFIG } from '../../ui/visual-assets/visual-assets.config';
import { RoundLossModal } from './round-loss-modal';

type RoundRevealedEvent = Extract<ServerEvent, { type: 'ROUND_REVEALED' }>;
type TurnTimedOutEvent = Extract<ServerEvent, { type: 'TURN_TIMED_OUT' }>;

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

function timeout(playerId = 'p1'): TurnTimedOutEvent {
  return { type: 'TURN_TIMED_OUT', playerId, dieLost: true };
}

function setup() {
  const fixture = TestBed.createComponent(RoundLossModal);
  const store = TestBed.inject(GameStore);
  return { fixture, store, instance: fixture.componentInstance };
}

/** Opens the modal for the local player 'p1' via their own timeout. */
function openForTimeout(): ReturnType<typeof setup> {
  const ctx = setup();
  ctx.store.playerId.set('p1');
  ctx.fixture.detectChanges();
  ctx.store.lastTimeout.set(timeout('p1'));
  ctx.fixture.detectChanges();
  return ctx;
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

// IonModal only stamps its <ng-template> content into the DOM once the real Stencil ion-modal
// element fires 'ionMount', which doesn't happen in jsdom — so these check the component's own
// signals (exactly what the template binds to), not scraped DOM text.
describe('RoundLossModal', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RoundLossModal] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // DESIGN_FEEDBACK.md item 14: the reveal card is the only loss surface for a lost challenge.
  // Presenting this modal over it made the two overlap, semi-transparent, while it faded out.
  describe('reveal losses (the reveal card owns these)', () => {
    it('does not open when the local player loses a call-liar reveal', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      fixture.detectChanges();
      store.lastReveal.set(reveal({ loserId: 'p1' }));
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(false);
    });

    it('closes a still-open timeout notice once a reveal takes the screen', () => {
      const { fixture, store, instance } = openForTimeout();
      expect(instance['isOpen']()).toBe(true);

      store.lastReveal.set(reveal({ loserId: 'p2' }));
      fixture.detectChanges();
      expect(instance['isOpen']()).toBe(false);
    });
  });

  // A pure timeout stall (5.7) has no reveal at all — without this, a player who simply ran out
  // of time gets zero feedback that they lost a die and why.
  describe('timeout loss notification (5.7)', () => {
    it('opens for the local player when their own turn timed out and cost them a die', () => {
      const { instance } = openForTimeout();
      expect(instance['isOpen']()).toBe(true);
    });

    it('does not open for another player timing out', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p2');
      fixture.detectChanges();
      store.lastTimeout.set(timeout('p1'));
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(false);
    });

    it('states how many dice remain after the loss', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      store.setState({
        ...gameOverState('p2'),
        phase: GamePhase.BIDDING,
        winnerId: null,
        players: [
          {
            id: 'p1',
            nickname: 'Me',
            isReady: true,
            diceCount: 1,
            dice: [],
            consecutivePureStalls: 1,
            eliminatedInRound: null,
          },
        ],
      });
      fixture.detectChanges();

      expect(instance['lossSummary']()).toBe('You lost one die — 1 remains.');
    });

    it('closes manually via the Close button and clears the auto-close timer', () => {
      const { fixture, instance } = openForTimeout();
      instance['close']();
      fixture.detectChanges();
      expect(instance['isOpen']()).toBe(false);

      vi.advanceTimersByTime(6000);
      expect(instance['isOpen']()).toBe(false);
    });

    it('auto-dismisses after 5 seconds without a manual close', () => {
      const { instance } = openForTimeout();
      vi.advanceTimersByTime(5000);
      expect(instance['isOpen']()).toBe(false);
    });

    it('does not reopen for the same timeout event after a manual close', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      fixture.detectChanges();
      const event = timeout('p1');
      store.lastTimeout.set(event);
      fixture.detectChanges();
      instance['close']();
      fixture.detectChanges();

      store.lastTimeout.set(null);
      fixture.detectChanges();
      store.lastTimeout.set(event);
      fixture.detectChanges();
      expect(instance['isOpen']()).toBe(false);
    });

    it('opens again for a genuinely new timeout after a previous one was dismissed', () => {
      const { fixture, store, instance } = openForTimeout();
      instance['close']();
      fixture.detectChanges();

      store.lastTimeout.set(timeout('p1'));
      fixture.detectChanges();
      expect(instance['isOpen']()).toBe(true);
    });
  });

  it('clears the auto-close timeout on component destruction', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { fixture } = openForTimeout();

    fixture.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });

  // Regression: once presented, Ionic's <ion-modal> relocates its rendered overlay outside this
  // component's own DOM subtree, so it must be force-removed via a direct element reference in
  // the destroy hook — and reading the wrong viewChild result there used to crash.
  it('does not throw when destroyed while open, and removes the modal element from the DOM', () => {
    const { fixture } = openForTimeout();
    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector('ion-modal')).not.toBeNull();

    expect(() => fixture.destroy()).not.toThrow();
    expect(nativeElement.querySelector('ion-modal')).toBeNull();
  });

  // GAME_OVER always wins over a still-open round-loss notification: the modal must never end
  // up covering the winner screen.
  describe('terminal-state correction (GAME_OVER)', () => {
    it('does not open for a timeout that arrives once the match is already GAME_OVER', () => {
      const { fixture, store, instance } = setup();
      store.playerId.set('p1');
      store.setState(gameOverState('p2'));
      fixture.detectChanges();

      store.lastTimeout.set(timeout('p1'));
      fixture.detectChanges();

      expect(instance['isOpen']()).toBe(false);
    });

    it('closes immediately if the match ends while the modal is already open', () => {
      const { fixture, store, instance } = openForTimeout();
      store.setState(gameOverState('p2'));
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
