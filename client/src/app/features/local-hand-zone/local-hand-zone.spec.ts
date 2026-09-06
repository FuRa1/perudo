import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { LocalHandZone } from './local-hand-zone';

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
  const fixture = TestBed.createComponent(LocalHandZone);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

describe('LocalHandZone', () => {
  beforeEach(() => {
    const socket = {
      rollDice: vi.fn(),
      placeBid: vi.fn(),
      callLiar: vi.fn(),
      declareSpecialRound: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [LocalHandZone],
      providers: [{ provide: SocketService, useValue: socket }],
    });
  });

  describe('mobile hand-roll state has no competing dice-cup affordance (Design QA audit, finding 10)', () => {
    it('renders the roll button and a reserved, non-interactive spacer instead of a dice cup', () => {
      const { nativeElement } = render('p1', roundRollingState());
      expect(nativeElement.querySelector('app-dice-cup')).toBeNull();
      const spacer = nativeElement.querySelector('.mobile-roll-stage');
      expect(spacer).not.toBeNull();
      expect(spacer?.getAttribute('aria-hidden')).toBe('true');
      expect(spacer?.matches('button, a, [tabindex]')).toBe(false);
      expect(nativeElement.querySelector('.mobile-hand-roll-btn')).not.toBeNull();
      expect(nativeElement.textContent ?? '').toContain(
        'Shake to roll, or use the button. Five dice, yours alone until reveal.',
      );
    });
  });

  describe('private hand strip stays sharp regardless of turn (Design QA audit, finding 9)', () => {
    it("renders the local hand strip with no sharp/blur modifier class on the local player's own turn", () => {
      const { nativeElement } = render('p1', biddingState());
      const strip = nativeElement.querySelector('.mobile-hand-strip');
      expect(strip).not.toBeNull();
      expect(strip?.className ?? '').not.toContain('sharp');
    });

    it("renders the local hand strip with no sharp/blur modifier class off the local player's own turn", () => {
      const { nativeElement } = render('p2', biddingState());
      const strip = nativeElement.querySelector('.mobile-hand-strip');
      expect(strip).not.toBeNull();
      expect(strip?.className ?? '').not.toContain('sharp');
    });
  });

  describe('opening roll', () => {
    it('shows the Cast button while the local player has not yet cast', () => {
      const state: StateSnapshot = {
        phase: GamePhase.START_ROLL,
        roomId: 'room-1',
        players: [player('p1', 'Alice'), player('p2', 'Bob')],
        startRoll: { pendingPlayerIds: ['p1', 'p2'], rolls: {} },
        completedStartRoll: null,
        winnerId: null,
        round: null,
        turnTimer: null,
      };
      const { nativeElement } = render('p1', state);
      expect(nativeElement.textContent ?? '').toContain('Cast');
      expect(nativeElement.querySelector('.mobile-opening-die')).not.toBeNull();
    });
  });
});
