import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../../../core/game-store';
import { SocketService } from '../../../../core/socket.service';
import { LinearDashboard } from './linear-dashboard';

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
    players: [player('p1', 'Alice'), player('p2', 'Bob'), player('p3', 'Cara')],
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: {
      roundNumber: 1,
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      bidHistory: [],
      isSpecialRoundDeclared: false,
      pendingRolls: [],
    },
    ...overrides,
    turnTimer: null,
  };
}

function render(playerId: string, state: StateSnapshot) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(state);
  const fixture = TestBed.createComponent(LinearDashboard);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

describe('LinearDashboard', () => {
  beforeEach(() => {
    const socket = {
      rollDice: vi.fn(),
      placeBid: vi.fn(),
      callLiar: vi.fn(),
      declareSpecialRound: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [LinearDashboard],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  describe('during BIDDING', () => {
    it('renders the current bidder in the spotlight, not in the waiting rail', () => {
      const { nativeElement } = render('p2', biddingState());
      const spotlight = nativeElement.querySelector('.linear-spotlight');
      expect(spotlight?.textContent ?? '').toContain('Alice');
      const rail = nativeElement.querySelector('.linear-rail');
      expect(rail?.textContent ?? '').not.toContain('Alice');
      expect(nativeElement.querySelectorAll('.linear-rail app-arc-seat')).toHaveLength(2);
    });

    it('orders the waiting rail starting with whoever answers next', () => {
      const { nativeElement } = render('p2', biddingState());
      const names = Array.from(nativeElement.querySelectorAll('.linear-rail app-arc-seat')).map(
        (el) => el.textContent ?? '',
      );
      expect(names[0]).toContain('Bob');
      expect(names[1]).toContain('Cara');
    });

    it('marks the local player seat for terracotta identity fill in the rail', () => {
      const { nativeElement } = render('p3', biddingState());
      const seats = Array.from(nativeElement.querySelectorAll('.linear-rail app-arc-seat'));
      const caraSeat = seats.find((s) => (s.textContent ?? '').includes('Cara'));
      expect(caraSeat?.querySelector('.arc-seat__tile--local')).not.toBeNull();
    });

    it('shows the standing bid on the spotlight card once one has been placed', () => {
      const state = biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p1', 'p2', 'p3'],
          currentTurnIndex: 1,
          bidHistory: [{ playerId: 'p1', bid: { kind: 'NORMAL', quantity: 4, face: 5 } }],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
      const { nativeElement } = render('p3', state);
      expect(nativeElement.querySelector('.linear-spotlight app-bid-marker')).not.toBeNull();
    });

    it('shows an opening-bid affordance when no bid has been placed yet', () => {
      const { nativeElement } = render('p2', biddingState());
      expect(nativeElement.querySelector('.linear-spotlight app-bid-marker')).toBeNull();
      expect(nativeElement.textContent ?? '').toContain('Opens the bidding');
    });

    it('collapses overflow seats into a "+N more" pill past the visible cap', () => {
      const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`, `Player${i}`));
      const state = biddingState({
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
      const { nativeElement } = render('p0', state);
      expect(nativeElement.querySelectorAll('.linear-rail app-arc-seat')).toHaveLength(5);
      expect(nativeElement.querySelector('.linear-rail__more')?.textContent ?? '').toContain(
        '+4 more',
      );
    });
  });

  describe('outside BIDDING (edge case: non-bidding phases)', () => {
    it('falls back to the Default arc treatment during ROUND_ROLLING', () => {
      const state = biddingState({
        phase: GamePhase.ROUND_ROLLING,
        round: {
          roundNumber: 1,
          turnOrder: ['p1', 'p2', 'p3'],
          currentTurnIndex: 0,
          bidHistory: [],
          isSpecialRoundDeclared: false,
          pendingRolls: ['p1', 'p2', 'p3'],
        },
      });
      const { nativeElement } = render('p1', state);
      expect(nativeElement.querySelector('app-default-dashboard')).not.toBeNull();
      expect(nativeElement.querySelector('.linear-spotlight')).toBeNull();
    });
  });
});
