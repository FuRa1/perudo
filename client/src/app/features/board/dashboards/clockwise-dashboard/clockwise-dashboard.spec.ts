import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../../../core/game-store';
import { SocketService } from '../../../../core/socket.service';
import { ClockwiseDashboard } from './clockwise-dashboard';

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

function manyPlayersState(totalPlayers: number, phase = GamePhase.BIDDING): StateSnapshot {
  const players = Array.from({ length: totalPlayers }, (_, i) => player(`p${i}`, `Player${i}`));
  return {
    phase,
    roomId: 'room-1',
    players,
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: {
      roundNumber: 1,
      turnOrder: players.map((p) => p.id),
      currentTurnIndex: 0,
      bidHistory: [],
      isSpecialRoundDeclared: false,
      pendingRolls: phase === GamePhase.BIDDING ? [] : players.map((p) => p.id),
    },
    turnTimer: null,
  };
}

function biddingState(overrides: Partial<MatchState> = {}): StateSnapshot {
  return {
    ...manyPlayersState(3),
    ...overrides,
    turnTimer: null,
  };
}

function render(playerId: string, state: StateSnapshot) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(state);
  const fixture = TestBed.createComponent(ClockwiseDashboard);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

describe('ClockwiseDashboard', () => {
  beforeEach(() => {
    const socket = {
      rollDice: vi.fn(),
      placeBid: vi.fn(),
      callLiar: vi.fn(),
      declareSpecialRound: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [ClockwiseDashboard],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  describe('during BIDDING', () => {
    it('renders the current bidder in the hero card, not in the ring', () => {
      const { nativeElement } = render('p1', biddingState());
      const hero = nativeElement.querySelector('.clockwise-hero');
      expect(hero?.textContent ?? '').toContain('Player0');
      const seats = nativeElement.querySelectorAll('.clockwise-ring__seat');
      expect(Array.from(seats).some((s) => (s.textContent ?? '').includes('Player0'))).toBe(false);
      expect(seats).toHaveLength(2);
    });

    it('places seats at distinct positions around the ring', () => {
      const { nativeElement } = render('p1', manyPlayersState(6));
      const seats = Array.from(
        nativeElement.querySelectorAll<HTMLElement>('.clockwise-ring__seat'),
      );
      const positions = new Set(seats.map((s) => `${s.style.left},${s.style.top}`));
      expect(positions.size).toBe(seats.length);
    });

    it('marks the local player seat for terracotta identity fill', () => {
      const { nativeElement } = render('p2', biddingState());
      const seats = Array.from(nativeElement.querySelectorAll('.clockwise-ring__seat'));
      const mySeat = seats.find((s) => (s.textContent ?? '').includes('Player2'));
      expect(mySeat?.querySelector('.arc-seat__tile--local')).not.toBeNull();
    });

    it('never dims the local player seat even when it lands in the dimmed tail', () => {
      const state = manyPlayersState(11);
      // p10 is last in turn order, and with p0 spotlighting, p10 is the very last seat in the ring
      // (indexFromEnd 0) — the one ringSeatOpacity would otherwise dim to .55.
      const { nativeElement } = render('p10', state);
      const seats = Array.from(
        nativeElement.querySelectorAll<HTMLElement>('.clockwise-ring__seat'),
      );
      const mySeat = seats.find((s) => (s.textContent ?? '').includes('Player10'));
      expect(mySeat?.style.opacity).toBe('1');
    });

    it('dims the tail of the waiting queue for everyone else', () => {
      // 11 players, p0 spotlighting: the waiting order is p1..p10, so p10 is last (most dimmed).
      const state = manyPlayersState(11);
      const { nativeElement } = render('p1', state);
      const seats = Array.from(
        nativeElement.querySelectorAll<HTMLElement>('.clockwise-ring__seat'),
      );
      const lastSeat = seats.find((s) => (s.textContent ?? '').includes('Player10'));
      expect(Number(lastSeat?.style.opacity)).toBeLessThan(1);
    });

    it('shows the standing bid on the hero card once one has been placed', () => {
      const state = biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p0', 'p1', 'p2'],
          currentTurnIndex: 1,
          bidHistory: [{ playerId: 'p0', bid: { kind: 'NORMAL', quantity: 4, face: 5 } }],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
      const { nativeElement } = render('p2', state);
      expect(nativeElement.querySelector('.clockwise-hero app-bid-marker')).not.toBeNull();
    });
  });

  describe('outside BIDDING (edge case: non-bidding phases)', () => {
    it('falls back to the Default arc treatment during ROUND_ROLLING', () => {
      const state = manyPlayersState(3, GamePhase.ROUND_ROLLING);
      const { nativeElement } = render('p0', state);
      expect(nativeElement.querySelector('app-default-dashboard')).not.toBeNull();
      expect(nativeElement.querySelector('.clockwise-ring')).toBeNull();
    });
  });

  describe('hero entrance (Phase 4 motion)', () => {
    it('plays the enter animation class when the spotlight first appears', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('.clockwise-hero--enter')).not.toBeNull();
    });

    it('clears the enter animation class after it finishes, and does not replay on an unrelated re-render', () => {
      vi.useFakeTimers();
      try {
        const { fixture, nativeElement } = render('p1', biddingState());
        vi.advanceTimersByTime(320);
        fixture.detectChanges();
        expect(nativeElement.querySelector('.clockwise-hero--enter')).toBeNull();

        // A dice-count change with the same spotlight must not replay the entrance.
        const store = TestBed.inject(GameStore);
        const state = biddingState();
        store.matchState.set({
          ...state,
          players: state.players.map((p) => (p.id === 'p0' ? { ...p, diceCount: 4 } : p)),
        });
        fixture.detectChanges();
        expect(nativeElement.querySelector('.clockwise-hero--enter')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('replays the enter animation when the spotlight changes hands', () => {
      vi.useFakeTimers();
      try {
        const { fixture, nativeElement } = render('p1', biddingState());
        vi.advanceTimersByTime(320);
        fixture.detectChanges();

        const store = TestBed.inject(GameStore);
        store.matchState.set(
          biddingState({
            round: {
              roundNumber: 1,
              turnOrder: ['p0', 'p1', 'p2'],
              currentTurnIndex: 1,
              bidHistory: [],
              isSpecialRoundDeclared: false,
              pendingRolls: [],
            },
          }),
        );
        fixture.detectChanges();
        expect(nativeElement.querySelector('.clockwise-hero--enter')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
