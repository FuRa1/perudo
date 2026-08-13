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

    it("shows the opponent's nickname (not their id) in the current-wager caption from the other player's perspective", () => {
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
      const caption =
        nativeElement.querySelector('.mobile-wager-token__caption')?.textContent ?? '';
      expect(caption).toContain('Unknown player');
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
      // p2 is next to act (currentTurnIndex 1), so the reference's "— your turn" suffix applies
      // (mobile-lantern.dc.html: "Anne's bid — your turn").
      expect(token?.textContent ?? '').toContain("Alice's bid — your turn");
    });

    it('is absent before any bid has been placed this round', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('.mobile-wager-token')).toBeNull();
    });

    it('omits "— your turn" for a viewer who is not next to act', () => {
      // Same bid/turn shape as above, but rendered as p1 — the bidder themself, and NOT next to
      // act (p2 is) — so the possessive form applies with no turn suffix (mobile-lantern.dc.html
      // only shows the suffix from the perspective of whoever is actually next to act).
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
      expect(caption).toBe('Your bid');
      expect(caption).not.toContain('your turn');
    });

    it('does not repeat the claim inside the fixed mobile tray — the wager token above is the only claim description', () => {
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
      // p2 is next to act, so the active picker (not the waiting bar) renders in the tray.
      const { nativeElement } = render('p2', state);
      expect(nativeElement.querySelector('.mobile-wager-token')).not.toBeNull();
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

      // History removal is presentation-only: the current wager token must still render.
      expect(nativeElement.querySelector('.mobile-wager-token')).not.toBeNull();
      expect(nativeElement.querySelector('app-bid-marker')).not.toBeNull();
    });
  });

  describe('reveal verdict copy (5.3)', () => {
    it('labels an exact count as a true bid and explains why the liar caller loses', () => {
      const { fixture, nativeElement } = render('p1', biddingState());
      const store = TestBed.inject(GameStore);
      store.lastReveal.set(
        reveal({
          claimedBid: { kind: 'NORMAL', quantity: 4, face: 6 },
          actualQuantity: 4,
          outcome: 'CALLER_LOSES',
          loserId: 'p2',
        }),
      );
      fixture.detectChanges();

      const text = nativeElement.textContent ?? '';
      expect(text).toContain('Truth revealed');
      expect(text).toContain('Bid true');
      expect(text).toContain('An exact match is still true');
      expect(text).toContain('Bob called liar — the bid was true, so they lose a die.');
      expect(nativeElement.querySelector('.mobile-reveal__verdict--true')).not.toBeNull();
      expect(
        fixture.componentInstance['revealOutcomeText'](
          reveal({ outcome: 'CALLER_LOSES', loserId: 'p1' }),
        ),
      ).toBe('You called liar — the bid was true, so you lose a die.');
    });

    it('labels a short count as a false bid and assigns the bidder as loser', () => {
      const { fixture, nativeElement } = render('p1', biddingState());
      const store = TestBed.inject(GameStore);
      store.lastReveal.set(
        reveal({
          actualQuantity: 2,
          outcome: 'BIDDER_LOSES',
          bidderId: 'p2',
          loserId: 'p2',
        }),
      );
      fixture.detectChanges();

      const text = nativeElement.textContent ?? '';
      expect(text).toContain('Bid false');
      expect(text).toContain('The actual count was below the claim.');
      expect(text).toContain("Bob's bid was false — they lose a die.");
      expect(nativeElement.querySelector('.mobile-reveal__verdict--false')).not.toBeNull();
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

  describe('mobile hand-roll state has no competing dice-cup affordance (Design QA audit, finding 10)', () => {
    it('renders the roll button and a reserved, non-interactive spacer instead of a dice cup', () => {
      const { nativeElement } = render('p1', roundRollingState());
      // Scoped to the mobile-only zone specifically: the desktop seat card for "me" (a separate,
      // CSS-hidden-on-mobile block in the same template) legitimately still renders its own
      // app-dice-cup regardless of phase — that one is untouched by this fix.
      const mobileZone = nativeElement.querySelector('.mobile-hand-zone');
      expect(mobileZone?.querySelector('app-dice-cup')).toBeNull();
      const spacer = mobileZone?.querySelector('.mobile-roll-stage');
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
      const state = biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p1', 'p2'],
          currentTurnIndex: 0,
          bidHistory: [],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
      const { nativeElement } = render('p1', state);
      const strip = nativeElement.querySelector('.mobile-hand-strip');
      expect(strip).not.toBeNull();
      expect(strip?.className ?? '').not.toContain('sharp');
    });

    it("renders the local hand strip with no sharp/blur modifier class off the local player's own turn", () => {
      const state = biddingState({
        round: {
          roundNumber: 1,
          turnOrder: ['p1', 'p2'],
          currentTurnIndex: 0,
          bidHistory: [],
          isSpecialRoundDeclared: false,
          pendingRolls: [],
        },
      });
      const { nativeElement } = render('p2', state);
      const strip = nativeElement.querySelector('.mobile-hand-strip');
      expect(strip).not.toBeNull();
      expect(strip?.className ?? '').not.toContain('sharp');
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
      expect(text).toContain('bid was false');
    });

    it('is absent when there has been no reveal yet', () => {
      const { nativeElement } = render('p1', biddingState());
      expect(nativeElement.querySelector('.mobile-reveal')).toBeNull();
    });
  });
});
