import { TestBed } from '@angular/core/testing';
import {
  GamePhase,
  type MatchState,
  type Player,
  type ServerEvent,
  type StateSnapshot,
} from '@shared';
import { GameStore } from './game-store';
import { GameView } from './game-view';

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

describe('GameView', () => {
  let store: GameStore;
  let view: GameView;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(GameStore);
    view = TestBed.inject(GameView);
  });

  describe('nicknameFor', () => {
    it("returns 'You' for the local player", () => {
      store.playerId.set('p1');
      store.matchState.set(biddingState());
      expect(view.nicknameFor('p1')).toBe('You');
    });

    it('returns the nickname for another player', () => {
      store.playerId.set('p2');
      store.matchState.set(biddingState());
      expect(view.nicknameFor('p1')).toBe('Alice');
    });

    it('falls back to a safe label for an unknown player id', () => {
      store.playerId.set('p1');
      store.matchState.set(biddingState());
      expect(view.nicknameFor('ghost')).toBe('Unknown player');
    });
  });

  describe('wagerCaptionFor', () => {
    it('appends "— your turn" when the viewer is next to act', () => {
      store.playerId.set('p2');
      store.matchState.set(
        biddingState({
          round: {
            roundNumber: 1,
            turnOrder: ['p1', 'p2'],
            currentTurnIndex: 1,
            bidHistory: [],
            isSpecialRoundDeclared: false,
            pendingRolls: [],
          },
        }),
      );
      expect(view.wagerCaptionFor('p1')).toBe("Alice's bid — your turn");
    });

    it('omits the suffix for the bidder themself', () => {
      store.playerId.set('p1');
      store.matchState.set(
        biddingState({
          round: {
            roundNumber: 1,
            turnOrder: ['p1', 'p2'],
            currentTurnIndex: 1,
            bidHistory: [],
            isSpecialRoundDeclared: false,
            pendingRolls: [],
          },
        }),
      );
      expect(view.wagerCaptionFor('p1')).toBe('Your bid');
    });
  });

  describe('latestBidRecord', () => {
    it('is null when bid history is empty', () => {
      store.matchState.set(biddingState());
      expect(view.latestBidRecord()).toBeNull();
    });

    it('is the last entry in bid history', () => {
      store.matchState.set(
        biddingState({
          round: {
            roundNumber: 1,
            turnOrder: ['p1', 'p2'],
            currentTurnIndex: 1,
            bidHistory: [
              { playerId: 'p1', bid: { kind: 'NORMAL', quantity: 4, face: 5 } },
              { playerId: 'p2', bid: { kind: 'NORMAL', quantity: 4, face: 6 } },
            ],
            isSpecialRoundDeclared: false,
            pendingRolls: [],
          },
        }),
      );
      expect(view.latestBidRecord()?.playerId).toBe('p2');
    });
  });

  describe('mobilePhaseLabel', () => {
    it('reports "Before round 1" with no round yet', () => {
      store.matchState.set(biddingState({ phase: GamePhase.LOBBY, round: null }));
      expect(view.mobilePhaseLabel()).toBe('Before round 1');
    });

    it("reports 'Your turn' during BIDDING on the local player's turn", () => {
      store.playerId.set('p1');
      store.matchState.set(biddingState());
      expect(view.mobilePhaseLabel()).toBe('Your turn');
    });

    it('reports the round number and total dice otherwise', () => {
      store.playerId.set('p2');
      store.matchState.set(biddingState());
      expect(view.mobilePhaseLabel()).toBe('Round 1 · 10 dice');
    });
  });

  describe('revealOutcomeText / revealLossSentence', () => {
    it('explains a true bid when the caller loses', () => {
      store.playerId.set('p2');
      const text = view.revealOutcomeText(reveal({ outcome: 'CALLER_LOSES', loserId: 'p1' }));
      expect(text).toContain('called liar');
    });

    it('explains a false bid when the bidder loses', () => {
      store.playerId.set('p1');
      const text = view.revealOutcomeText(reveal({ outcome: 'BIDDER_LOSES', loserId: 'p1' }));
      expect(text).toBe('Your bid was false — you lose a die.');
    });

    it('states who it cost with no restatement of the reasoning', () => {
      store.playerId.set('p2');
      store.matchState.set(biddingState());
      expect(view.revealLossSentence(reveal({ loserId: 'p1' }))).toBe('Alice loses a die.');
    });
  });

  describe('revealRows', () => {
    it('is empty with no reveal', () => {
      expect(view.revealRows()).toEqual([]);
    });

    it('rings dice matching the claimed face, flags the bidder and loser', () => {
      store.playerId.set('p1');
      store.matchState.set(biddingState());
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
      const rows = view.revealRows();
      expect(rows).toHaveLength(2);
      const p1Row = rows.find((r) => r.playerId === 'p1');
      expect(p1Row?.dice.some((d) => d.ringed)).toBe(true);
      const p2Row = rows.find((r) => r.playerId === 'p2');
      expect(p2Row?.isBidder).toBe(true);
      expect(p2Row?.isLoser).toBe(true);
    });
  });

  describe('nextRoundSummary', () => {
    it('is null with no reveal', () => {
      store.matchState.set(biddingState());
      expect(view.nextRoundSummary()).toBeNull();
    });

    it('conjugates for the local loser', () => {
      store.playerId.set('p1');
      store.matchState.set(biddingState());
      store.lastReveal.set(reveal({ loserId: 'p1' }));
      expect(view.nextRoundSummary()).toContain('You drop to');
    });

    it('reports elimination when the loser reaches zero dice', () => {
      store.playerId.set('p1');
      store.matchState.set(
        biddingState({
          players: [player('p1', 'Alice', { diceCount: 0 }), player('p2', 'Bob')],
        }),
      );
      store.lastReveal.set(reveal({ loserId: 'p1' }));
      expect(view.nextRoundSummary()).toBe('You are out.');
    });
  });

  describe('currentBidderId / isMyBiddingTurn', () => {
    it('is null outside BIDDING', () => {
      store.matchState.set(biddingState({ phase: GamePhase.ROUND_ROLLING }));
      expect(view.currentBidderId()).toBeNull();
    });

    it('identifies the seat whose turn it is during BIDDING', () => {
      store.matchState.set(biddingState());
      expect(view.currentBidderId()).toBe('p1');
    });

    it('is true only for the local player on their own turn', () => {
      store.playerId.set('p1');
      store.matchState.set(biddingState());
      expect(view.isMyBiddingTurn()).toBe(true);
      store.playerId.set('p2');
      expect(view.isMyBiddingTurn()).toBe(false);
    });
  });
});
