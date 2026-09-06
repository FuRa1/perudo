import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GamePhase, type MatchState, type Player, type StateSnapshot } from '@shared';
import { GameStore } from '../../../core/game-store';
import { SocketService } from '../../../core/socket.service';
import { BoardShell } from './board-shell';

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

function render(playerId: string, state: StateSnapshot) {
  const store = TestBed.inject(GameStore);
  store.playerId.set(playerId);
  store.matchState.set(state);
  const fixture = TestBed.createComponent(BoardShell);
  fixture.detectChanges();
  return { fixture, nativeElement: fixture.nativeElement as HTMLElement };
}

describe('BoardShell', () => {
  beforeEach(() => {
    const socket = {
      rollDice: vi.fn(),
      placeBid: vi.fn(),
      callLiar: vi.fn(),
      declareSpecialRound: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [BoardShell],
      providers: [{ provide: SocketService, useValue: socket }],
    });
    localStorage.clear();
  });

  describe('dashboard switcher', () => {
    it('renders the Default dashboard and a switcher pill naming the next layout', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('app-default-dashboard')).not.toBeNull();
      const switcher = nativeElement.querySelector('.table-layout-switcher');
      expect(switcher?.textContent ?? '').toContain('Clockwise');
    });

    it('switches the rendered dashboard on click, without changing the header/rail shell', () => {
      const { fixture, nativeElement } = render('p1', biddingState());
      const switcher = nativeElement.querySelector<HTMLButtonElement>('.table-layout-switcher');
      switcher?.click();
      fixture.detectChanges();
      expect(nativeElement.querySelector('app-default-dashboard')).toBeNull();
      expect(nativeElement.querySelector('app-clockwise-dashboard')).not.toBeNull();
      expect(nativeElement.querySelector('.table-layout-switcher')?.textContent ?? '').toContain(
        'Linear',
      );
      // The bid rail is shell content — it must not move or disappear on a layout switch.
      expect(nativeElement.querySelectorAll('app-bid-controls')).toHaveLength(1);
    });
  });

  describe('bid nicknames (1.)', () => {
    it("shows 'You' for the local player in the current-wager caption, never a raw player id", () => {
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
      const caption =
        nativeElement.querySelector('.mobile-wager-token__caption')?.textContent ?? '';
      expect(caption).toContain('You');
      expect(caption).not.toContain('p1');
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
      const caption =
        nativeElement.querySelector('.mobile-wager-token__caption')?.textContent ?? '';
      expect(caption).toContain('Alice');
      expect(caption).not.toContain('p1');
    });
  });

  describe('mobile wager token', () => {
    it('shows the current bid as a standalone marker, with whose wager it is', () => {
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
      const token = nativeElement.querySelector('app-wager-token');
      expect(token).not.toBeNull();
      expect(token?.querySelector('app-bid-marker')).not.toBeNull();
      expect(token?.textContent ?? '').toContain("Alice's bid — your turn");
    });

    it('is absent before any bid has been placed this round', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('app-wager-token')).toBeNull();
    });

    it('does not repeat the claim inside the fixed mobile tray — the wager token is the only claim description', () => {
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
      expect(nativeElement.querySelector('app-wager-token')).not.toBeNull();
      const tray = nativeElement.querySelector('.mobile-bid-sheet-wrap');
      expect(tray).not.toBeNull();
      expect(tray?.textContent ?? '').not.toContain('claimed');
      expect(tray?.textContent ?? '').not.toContain('Raise or call');
      expect(tray?.querySelector('app-bid-picker')).not.toBeNull();
    });
  });

  describe('no bid-history UI on the mobile board', () => {
    it('renders no Ledger chip, ledger modal, or bid-history list, while the current wager stays visible', () => {
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

      expect(text).not.toContain('Ledger');
      expect(nativeElement.querySelector('.table-mobile-header__chip--ledger')).toBeNull();
      expect(nativeElement.querySelector('ion-modal.table-ledger-modal')).toBeNull();
      expect(nativeElement.querySelector('.table-ledger')).toBeNull();
      expect(nativeElement.querySelector('.table__bid-history')).toBeNull();
      expect(text).not.toContain('Bid history');

      expect(nativeElement.querySelector('app-wager-token')).not.toBeNull();
      expect(nativeElement.querySelector('app-bid-marker')).not.toBeNull();
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
      expect(summary?.textContent ?? '').toContain('4 × fives');
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
});
