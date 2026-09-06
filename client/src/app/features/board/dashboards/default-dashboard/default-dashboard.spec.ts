import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../../../core/game-store';
import { SocketService } from '../../../../core/socket.service';
import { DefaultDashboard } from './default-dashboard';

function player(id: string, nickname: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    nickname,
    isReady: true,
    diceCount: 5,
    dice: [1, 2, 3, 4, 5],
    consecutivePureStalls: 0,
    eliminatedInRound: null,
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

/** ROUND_ROLLING already has turnOrder/currentTurnIndex populated (they're decided as soon as
 * the round starts) — the state the current-bidder gating fix has to distinguish from BIDDING. */
function roundRollingState(overrides: Partial<MatchState> = {}): StateSnapshot {
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
    turnTimer: null,
  };
}

function render(playerId: string, state: StateSnapshot) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(state);
  const fixture = TestBed.createComponent(DefaultDashboard);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

function seatCardHasMarker(seatCardEl: Element): boolean {
  return !!seatCardEl.querySelector('app-bid-marker');
}

describe('DefaultDashboard', () => {
  beforeEach(() => {
    const socket = {
      rollDice: vi.fn(),
      placeBid: vi.fn(),
      callLiar: vi.fn(),
      declareSpecialRound: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [DefaultDashboard],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  describe('current-bid marker (2.) — desktop/tablet seat-card arc', () => {
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

  describe('centered opponent grid', () => {
    function manyPlayersState(totalPlayers: number): StateSnapshot {
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

    it('splits 11 opponents into three balanced depth lines', () => {
      const { nativeElement } = render('p0', manyPlayersState(12));
      const rows = nativeElement.querySelectorAll('.mobile-seat-grid__row');
      expect(rows).toHaveLength(3);
      const seatsInRows = Array.from(rows).map(
        (row) => row.querySelectorAll('app-arc-seat').length,
      );
      expect(seatsInRows).toEqual([3, 4, 4]);
      expect(nativeElement.querySelectorAll('.mobile-seat-grid app-arc-seat')).toHaveLength(11);
    });

    it.each([1, 2, 3, 4, 5, 6, 7, 8])(
      'keeps all %i opponents in balanced rows in seating order',
      (count) => {
        const { nativeElement } = render('p0', manyPlayersState(count + 1));
        const rows = [...nativeElement.querySelectorAll('.mobile-seat-grid__row')];
        expect(rows).toHaveLength(count < 5 ? 1 : 2);
        const sizes = rows.map((row) => row.querySelectorAll('app-arc-seat').length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        const names = [...nativeElement.querySelectorAll('.mobile-seat-grid .arc-seat__name')].map(
          (name) => name.textContent?.trim(),
        );
        expect(names).toEqual(Array.from({ length: count }, (_, i) => `Player${i + 1}`));
      },
    );
  });
});
