import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player, type ServerEvent } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { Table } from './table';

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

function biddingState(overrides: Partial<MatchState> = {}): MatchState {
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
  };
}

/** ROUND_ROLLING already has turnOrder/currentTurnIndex populated (they're decided as soon as
 * the round starts) — the state this task's fix has to distinguish from BIDDING. */
function roundRollingState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    phase: GamePhase.ROUND_ROLLING,
    roomId: 'room-1',
    players: [player('p1', 'Alice'), player('p2', 'Bob')],
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: {
      roundNumber: 1,
      turnOrder: ['p2', 'p1'],
      currentTurnIndex: 0,
      bidHistory: [],
      isSpecialRoundDeclared: false,
      pendingRolls: ['p1', 'p2'],
    },
    ...overrides,
  };
}

function render(playerId: string, state: MatchState) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(state);
  const fixture = TestBed.createComponent(Table);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

/** True if the given seat card renders the bid marker inline within its own layout. */
function seatCardHasMarker(seatCardEl: Element): boolean {
  return !!seatCardEl.querySelector('app-bid-marker');
}

describe('Table', () => {
  beforeEach(() => {
    const socket = {
      rollDice: vi.fn(),
      placeBid: vi.fn(),
      callLiar: vi.fn(),
      declareSpecialRound: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [Table],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  describe('bid history nicknames (1.)', () => {
    it("shows 'You' for the local player and the opponent's nickname, never a raw player id", () => {
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
      const { nativeElement } = render('p1', state);
      const text = nativeElement.textContent ?? '';
      expect(text).toContain('You:');
      expect(text).not.toContain('p1:');
    });

    it("shows the opponent's nickname (not their id) from the other player's perspective", () => {
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
      const { nativeElement } = render('p2', state);
      const text = nativeElement.textContent ?? '';
      expect(text).toContain('Alice:');
      expect(text).not.toContain('p1:');
    });

    it('falls back to a safe label for a bid from a player no longer in the roster', () => {
      const state = biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p1', 'p2'],
          currentTurnIndex: 1,
          bidHistory: [{ playerId: 'ghost', bid: { kind: 'NORMAL', quantity: 1, face: 2 } }],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
      const { nativeElement } = render('p1', state);
      expect(nativeElement.textContent ?? '').toContain('Unknown player:');
    });
  });

  describe('current-bid marker (2.)', () => {
    it('renders no marker when bid history is empty', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('app-bid-marker')).toBeNull();
    });

    it("renders exactly one seat-card marker, attached to the latest bidder's own seat card", () => {
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
      const { nativeElement } = render('p1', state);
      // Increment 4 adds a second, mobile-only marker in the standalone wager token (not inside
      // any seat card) — desktop's seat-card marker stays exactly one, scoped accordingly.
      const seatCardMarkers = nativeElement.querySelectorAll('app-seat-card app-bid-marker');
      expect(seatCardMarkers).toHaveLength(1);

      const seatCards = Array.from(nativeElement.querySelectorAll('app-seat-card'));
      const aliceCard = seatCards.find((c) => (c.textContent ?? '').includes('Alice'));
      const bobCard = seatCards.find((c) => (c.textContent ?? '').includes('Bob'));
      expect(aliceCard && seatCardHasMarker(aliceCard)).toBe(true);
      expect(bobCard && seatCardHasMarker(bobCard)).toBe(false);
    });

    it('moves the marker to the new bidder and updates its value when a newer bid is placed', () => {
      const state = biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p1', 'p2'],
          currentTurnIndex: 0,
          bidHistory: [
            { playerId: 'p1', bid: { kind: 'NORMAL', quantity: 4, face: 5 } },
            { playerId: 'p2', bid: { kind: 'NORMAL', quantity: 4, face: 6 } },
          ],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
      const { nativeElement } = render('p1', state);
      const seatCardMarkers = nativeElement.querySelectorAll('app-seat-card app-bid-marker');
      expect(seatCardMarkers).toHaveLength(1);

      const seatCards = Array.from(nativeElement.querySelectorAll('app-seat-card'));
      const aliceCard = seatCards.find((c) => (c.textContent ?? '').includes('Alice'));
      const bobCard = seatCards.find((c) => (c.textContent ?? '').includes('Bob'));
      expect(bobCard && seatCardHasMarker(bobCard)).toBe(true);
      expect(aliceCard && seatCardHasMarker(aliceCard)).toBe(false);
      // The marker itself reflects the new (4x6) bid, not the superseded 4x5.
      expect(seatCardMarkers[0]?.textContent ?? '').toContain('4');
    });

    it('disappears once the round ends and bid history is empty again', () => {
      const { fixture, nativeElement } = render(
        'p1',
        biddingState({
          round: {
            roundNumber: 1,
            turnOrder: ['p1', 'p2'],
            currentTurnIndex: 1,
            bidHistory: [{ playerId: 'p1', bid: { kind: 'NORMAL', quantity: 4, face: 5 } }],
            isSpecialRoundDeclared: false,
            pendingRolls: [],
          },
        }),
      );
      expect(nativeElement.querySelectorAll('app-bid-marker').length).toBeGreaterThan(0);

      const store = TestBed.inject(GameStore);
      store.matchState.set(
        biddingState({
          round: {
            roundNumber: 2,
            turnOrder: ['p2', 'p1'],
            currentTurnIndex: 0,
            bidHistory: [],
            isSpecialRoundDeclared: false,
            pendingRolls: [],
          },
        }),
      );
      fixture.detectChanges();
      expect(nativeElement.querySelectorAll('app-bid-marker')).toHaveLength(0);
    });
  });

  describe('mobile wager token (Increment 4)', () => {
    it('shows the current bid as a standalone marker on the mat, with whose wager it is', () => {
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
      const { nativeElement } = render('p2', state);
      const token = nativeElement.querySelector('.mobile-wager-token');
      expect(token).not.toBeNull();
      expect(token?.querySelector('app-bid-marker')).not.toBeNull();
      expect(token?.textContent ?? '').toContain("Alice's wager stands");
    });

    it('is absent before any bid has been placed this round', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('.mobile-wager-token')).toBeNull();
    });
  });

  describe('bidding rail (Design Layout Task 4)', () => {
    it('renders exactly one app-bid-controls, inside the rail column, never duplicated', () => {
      const { nativeElement } = render('p1', biddingState());
      const rail = nativeElement.querySelector('.table-layout__rail');
      expect(rail).not.toBeNull();
      expect(nativeElement.querySelectorAll('app-bid-controls')).toHaveLength(1);
      expect(rail?.querySelector('app-bid-controls')).not.toBeNull();
    });

    it('shows a neutral opening-bid summary in the rail when no bid has been placed yet', () => {
      const { nativeElement } = render('p1', biddingState());
      const summary = nativeElement.querySelector('.table-rail__summary');
      expect(summary?.textContent ?? '').toContain('No bids yet this round');
    });

    it("shows the latest bidder's name and bid in the rail summary once a bid exists", () => {
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
      const { nativeElement } = render('p2', state);
      const summary = nativeElement.querySelector('.table-rail__summary');
      expect(summary?.textContent ?? '').toContain('Alice claimed');
      expect(summary?.textContent ?? '').toContain('4 × face 5');
    });

    it('keeps the bid-history ledger inside the rail column alongside the controls', () => {
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
      const { nativeElement } = render('p1', state);
      const rail = nativeElement.querySelector('.table-layout__rail');
      expect(rail?.querySelector('.table__bid-history')).not.toBeNull();
    });

    it('does not render the rail summary or bid-controls outside the BIDDING phase', () => {
      const { nativeElement } = render(
        'p1',
        biddingState({ phase: GamePhase.ROUND_ROLLING, round: null }),
      );
      expect(nativeElement.querySelector('.table-rail__summary')).toBeNull();
      expect(nativeElement.querySelectorAll('app-bid-controls')).toHaveLength(0);
    });
  });

  // Design QA Task 6, finding 1: turnOrder/currentTurnIndex are already decided as soon as a
  // round starts, well before bidding — the eventual first bidder must not read as "Bidding"
  // while hands are still being rolled.
  describe('current-bidder badge phase gating (Design QA Task 6)', () => {
    it('shows no "Bidding" badge on any seat during ROUND_ROLLING, even though turn order is already decided', () => {
      const { nativeElement } = render('p1', roundRollingState());
      const seatCards = Array.from(nativeElement.querySelectorAll('app-seat-card'));
      expect(seatCards.length).toBeGreaterThan(0);
      for (const card of seatCards) {
        expect(card.textContent ?? '').not.toContain('Bidding');
      }
    });

    it('shows the "Bidding" badge on exactly the current bidder once phase is BIDDING', () => {
      const state = biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p2', 'p1'],
          currentTurnIndex: 0,
          bidHistory: [],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
      const { nativeElement } = render('p1', state);
      const seatCards = Array.from(nativeElement.querySelectorAll('app-seat-card'));
      const aliceCard = seatCards.find((c) => (c.textContent ?? '').includes('Alice'));
      const bobCard = seatCards.find((c) => (c.textContent ?? '').includes('Bob'));
      expect(bobCard?.textContent ?? '').toContain('Bidding');
      expect(aliceCard?.textContent ?? '').not.toContain('Bidding');
    });
  });

  describe('9-12 player stress case (Increment 5)', () => {
    function manyPlayersState(totalPlayers: number): MatchState {
      const players = Array.from({ length: totalPlayers }, (_, i) => player(`p${i}`, `Player${i}`));
      return biddingState({
        players,
        round: {
          roundNumber: 1,
          turnOrder: players.map((p) => p.id),
          currentTurnIndex: 0,
          bidHistory: [],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
    }

    it('splits 11 opponents (12 players) into a front row of 6 and a back row of 5, both compact', () => {
      const { nativeElement } = render('p0', manyPlayersState(12));
      const rows = nativeElement.querySelectorAll('.mobile-arc-stress__row');
      expect(rows).toHaveLength(2);
      const seatsInRows = Array.from(rows).map(
        (row) => row.querySelectorAll('app-arc-seat').length,
      );
      expect(seatsInRows.sort()).toEqual([5, 6]);
      expect(nativeElement.querySelectorAll('.mobile-arc-stress app-arc-seat')).toHaveLength(11);
    });

    it('keeps the single-row arc for 8 players (7 opponents), below the stress threshold', () => {
      const { nativeElement } = render('p0', manyPlayersState(8));
      expect(nativeElement.querySelector('.mobile-arc-stress')).toBeNull();
      expect(nativeElement.querySelector('.mobile-arc-wrap')).not.toBeNull();
    });
  });

  describe('mobile reveal panel (Increment 5)', () => {
    it('shows claimed vs actual and every revealed hand', () => {
      const store = TestBed.inject(GameStore);
      store.playerId.set('p1');
      store.matchState.set(biddingState());
      // loserId is p2 (Bob), not the local player (p1) — RoundLossModal only auto-opens its own
      // ion-modal when the loser is the local player, and this test isn't exercising that modal.
      store.lastReveal.set(
        reveal({
          dice: { p1: [1, 2, 3, 4, 5], p2: [6, 6, 1, 2, 3] },
          claimedBid: { kind: 'NORMAL', quantity: 4, face: 5 },
          bidderId: 'p2',
          actualQuantity: 2,
          outcome: 'BIDDER_LOSES',
          loserId: 'p2',
        }),
      );
      const fixture = TestBed.createComponent(Table);
      fixture.detectChanges();
      const panel = (fixture.nativeElement as HTMLElement).querySelector('.mobile-reveal');
      expect(panel).not.toBeNull();
      const text = panel?.textContent ?? '';
      expect(text).toContain('4 × face 5');
      expect(text).toContain('2');
      expect(text).toContain('You'); // p1 is the local player here
      expect(text).toContain('Bob');
      expect(panel?.querySelectorAll('app-die').length).toBe(10);
      expect(text).toContain('wager was false');
    });

    it('is absent when there has been no reveal yet', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('.mobile-reveal')).toBeNull();
    });
  });
});
