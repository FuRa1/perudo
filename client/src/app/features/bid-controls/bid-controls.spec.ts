import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { BidControls } from './bid-controls';

function player(id: string, nickname: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    nickname,
    isReady: true,
    diceCount: 5,
    dice: [1, 2, 3, 4, 5],
    consecutivePureStalls: 0,
    ...overrides,
  };
}

function biddingState(overrides: Partial<MatchState> = {}): StateSnapshot {
  return {
    phase: GamePhase.BIDDING,
    roomId: 'room-1',
    players: [player('p1', 'Alice'), player('p2', 'Bob')],
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: {
      roundNumber: 1,
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      bidHistory: [],
      isSpecialRoundDeclared: false,
      pendingRolls: [],
    },
    ...overrides,
    turnTimer: null,
  };
}

interface FakeSocket {
  placeBid: ReturnType<typeof vi.fn>;
  callLiar: ReturnType<typeof vi.fn>;
  declareSpecialRound: ReturnType<typeof vi.fn>;
}

function render(playerId: string, state: StateSnapshot) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(state);
  const fixture = TestBed.createComponent(BidControls);
  fixture.detectChanges();
  return { fixture, text: (fixture.nativeElement as HTMLElement).textContent ?? '' };
}

describe('BidControls', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = { placeBid: vi.fn(), callLiar: vi.fn(), declareSpecialRound: vi.fn() };
    TestBed.configureTestingModule({
      imports: [BidControls],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  it('shows the interactive picker, suggestions, and Place bid/Call liar only for the active player', () => {
    const { text } = render('p1', biddingState());
    expect(text).toContain('Place bid');
    expect(text).toContain('Call liar');
    // "Min" is the compact visible label (5.8) — the full "Minimum" only lives in the aria-label.
    expect(text).toContain('Min');
    expect(text).not.toContain('Waiting for');
  });

  it('marks Place bid as the primary action and Call liar as the distinct danger action', () => {
    const { fixture } = render('p1', biddingState());
    const nativeElement = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(nativeElement.querySelectorAll('ion-button'));
    const placeBid = buttons.find((b) => b.textContent?.includes('Place bid'));
    const callLiar = buttons.find((b) => b.textContent?.includes('Call liar'));
    expect(placeBid?.getAttribute('color')).toBe('primary');
    expect(callLiar?.getAttribute('color')).toBe('danger');
    // Call liar is outlined, not solid, and carries no icon (reference: mobile-lantern.dc.html /
    // perudo-design-kit.dc.html §5 both show a plain text-only outlined button).
    expect(callLiar?.getAttribute('fill')).toBe('outline');
    expect(callLiar?.querySelector('svg')).toBeNull();
  });

  it('shows a neutral waiting status bar (who is acting, who answers next) instead of the picker for the inactive player', () => {
    const { text } = render('p2', biddingState());
    expect(text).toContain('Alice weighs their wager');
    expect(text).toContain('Bob answers next');
    expect(text).not.toContain('Place bid');
    expect(text).not.toContain('Call liar');
    expect(text).not.toContain('Min:');
    expect(text).not.toContain('Not a legal raise');
  });

  it('wraps around to the first seat for "answers next" when the active player is last in turn order', () => {
    const state = biddingState({
      players: [player('p1', 'Alice'), player('p2', 'Bob'), player('p3', 'Cleo')],
      round: {
        roundNumber: 1,
        turnOrder: ['p1', 'p2', 'p3'],
        currentTurnIndex: 2,
        bidHistory: [],
        isSpecialRoundDeclared: false,
        pendingRolls: [],
      },
    });
    const { text } = render('p1', state);
    expect(text).toContain('Cleo weighs their wager');
    expect(text).toContain('Alice answers next');
  });

  it('does not show a false "Not a legal raise" for the newly-active player right after a 4x5 first bid', () => {
    // p1 opened with 4x5; it's now p2's turn. Before this fix, p2's local picker still defaulted
    // to quantity 1/face 2 (stale), which is an illegal raise over 4x5 and would show a spurious
    // error the instant the picker became interactive — even though p2 hasn't touched anything.
    const state = biddingState({
      round: {
        roundNumber: 1,
        turnOrder: ['p1', 'p2'],
        currentTurnIndex: 1,
        bidHistory: [{ playerId: 'p1', bid: { kind: 'NORMAL', quantity: 4, face: 5 } }],
        isSpecialRoundDeclared: false,
        pendingRolls: [],
      },
    });
    const { text } = render('p2', state);
    expect(text).not.toContain('Not a legal raise');
    expect(text).toContain('Place bid');
  });

  it('lets the active player submit 4x5 as the first bid of the round', () => {
    const { fixture } = render('p1', biddingState());
    const instance = fixture.componentInstance as unknown as {
      onQuantityChange(v: number): void;
      onFaceChange(v: number): void;
      placeBid(): void;
    };
    instance.onQuantityChange(4);
    instance.onFaceChange(5);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Not a legal raise');

    instance.placeBid();
    expect(socket.placeBid).toHaveBeenCalledWith({ kind: 'NORMAL', quantity: 4, face: 5 });
  });

  it("hides the waiting-player's stale picker immediately once the turn moves on to them, replacing it with the active view", () => {
    const store = TestBed.inject(GameStore);
    store.playerId.set('p2');
    store.matchState.set(biddingState()); // p1's turn
    const fixture = TestBed.createComponent(BidControls);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain(
      'Alice weighs their wager',
    );

    // The turn passes to p2.
    store.matchState.set(
      biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p1', 'p2'],
          currentTurnIndex: 1,
          bidHistory: [{ playerId: 'p1', bid: { kind: 'NORMAL', quantity: 1, face: 2 } }],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      }),
    );
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('weighs their wager');
    expect(text).toContain('Place bid');
  });
});
