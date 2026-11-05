import { TestBed } from '@angular/core/testing';
import { GamePhase, normalBid, type ServerEvent, type StateSnapshot } from '@shared';
import { GameStore } from './game-store';

type RoundRevealedEvent = Extract<ServerEvent, { type: 'ROUND_REVEALED' }>;

function reveal(overrides: Partial<RoundRevealedEvent> = {}): RoundRevealedEvent {
  return {
    type: 'ROUND_REVEALED',
    dice: {},
    claimedBid: normalBid(3, 4),
    bidderId: 'p1',
    actualQuantity: 2,
    outcome: 'BIDDER_LOSES',
    loserId: 'p1',
    ...overrides,
  };
}

function biddingState(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    phase: GamePhase.BIDDING,
    roomId: 'room-1',
    players: [],
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
    turnTimer: null,
    ...overrides,
  };
}

describe('GameStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('keeps the reveal recap visible until I roll my own hand for the next round', () => {
    const store = TestBed.inject(GameStore);
    store.playerId.set('p2');
    store.matchState.set(biddingState());

    store.applyEvents([reveal({ loserId: 'p1' })]);
    expect(store.lastReveal()).not.toBeNull();

    // The new round starts rolling — an opponent (not me) rolling their hand must not clear it.
    store.applyEvents([{ type: 'PLAYER_ROLLED_HAND', playerId: 'p1' }]);
    expect(store.lastReveal()).not.toBeNull();

    // Once I roll my own hand for the new round, the stale recap is cleared — it must never
    // still be showing once the next round's own hand-roll/bidding UI is up (no stale UI after
    // a round transition).
    store.applyEvents([{ type: 'PLAYER_ROLLED_HAND', playerId: 'p2' }]);
    expect(store.lastReveal()).toBeNull();
  });

  it('does not error when a hand-roll event arrives before any reveal has ever happened (round 1)', () => {
    const store = TestBed.inject(GameStore);
    store.playerId.set('p1');
    store.matchState.set(biddingState());

    expect(() => store.applyEvents([{ type: 'PLAYER_ROLLED_HAND', playerId: 'p1' }])).not.toThrow();
    expect(store.lastReveal()).toBeNull();
  });

  it('snapshots whether the just-revealed round was a special round, read before the state update lands', () => {
    const store = TestBed.inject(GameStore);
    store.playerId.set('p1');
    store.matchState.set(
      biddingState({ round: { ...biddingState().round!, isSpecialRoundDeclared: true } }),
    );

    store.applyEvents([reveal()]);
    expect(store.lastRevealWasSpecialRound()).toBe(true);
  });

  it('records a die-losing timeout for round-loss feedback, but ignores a protected (no-die-lost) stall', () => {
    const store = TestBed.inject(GameStore);
    store.playerId.set('p1');
    store.matchState.set(biddingState());

    store.applyEvents([{ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: false }]);
    expect(store.lastTimeout()).toBeNull();

    store.applyEvents([{ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: true }]);
    expect(store.lastTimeout()).toEqual({ type: 'TURN_TIMED_OUT', playerId: 'p1', dieLost: true });
  });

  it('shows and clears the session-restore-failed flag, and setJoined always resets it (section 7 UX)', () => {
    const store = TestBed.inject(GameStore);
    expect(store.sessionRestoreFailed()).toBe(false);

    store.setSessionRestoreFailed();
    expect(store.sessionRestoreFailed()).toBe(true);

    store.clearSessionRestoreFailed();
    expect(store.sessionRestoreFailed()).toBe(false);

    // A successful join/reconnect (the 'joined' socket event) always resets it, even if nobody
    // called clearSessionRestoreFailed() first — the notice must never survive into a real match.
    store.setSessionRestoreFailed();
    store.setJoined('p1');
    expect(store.sessionRestoreFailed()).toBe(false);
  });

  describe('spectator (eliminated, still seated)', () => {
    const seat = (id: string, diceCount: number) => ({
      id,
      nickname: id,
      isReady: true,
      diceCount,
      dice: [],
      consecutivePureStalls: 0,
      eliminatedInRound: diceCount === 0 ? 2 : null,
    });

    it('is a spectator only with no dice left, while the match is still running', () => {
      const store = TestBed.inject(GameStore);
      store.playerId.set('p3');
      store.matchState.set(biddingState({ players: [seat('p1', 3), seat('p3', 0)] }));
      expect(store.isSpectator()).toBe(true);

      store.matchState.set(
        biddingState({ phase: GamePhase.GAME_OVER, players: [seat('p1', 3), seat('p3', 0)] }),
      );
      expect(store.isSpectator()).toBe(false);

      store.matchState.set(biddingState({ players: [seat('p1', 3), seat('p3', 1)] }));
      expect(store.isSpectator()).toBe(false);
    });

    it('keeps the reveal while the others roll, then clears it once bidding opens', () => {
      const store = TestBed.inject(GameStore);
      store.playerId.set('p3');
      const players = [seat('p1', 3), seat('p2', 2), seat('p3', 0)];
      store.setState(biddingState({ players, phase: GamePhase.ROUND_ROLLING }));
      store.applyEvents([reveal({ loserId: 'p3' })]);

      store.setState(biddingState({ players, phase: GamePhase.ROUND_ROLLING }));
      expect(store.lastReveal()).not.toBeNull();

      // A spectator never rolls, so without this the recap stayed up for the rest of the match.
      store.setState(biddingState({ players }));
      expect(store.lastReveal()).toBeNull();
    });
  });
});
