import { normalBid } from '@shared/types/bid.types';
import type { DiceValue } from '@shared/types/dice.types';
import { ErrorCode } from '@shared/types/error.types';
import type { BidRecord, MatchState, Player, RoundState } from '@shared/types/state.types';
import { GamePhase } from '@shared/types/state.types';
import {
  applyIntent,
  applyTimeout,
  createInitialMatchState,
  type EngineDeps,
  type EngineResult,
} from './game-engine';
import { SequenceDiceRoller } from '@shared/testing/sequence-dice-roller';

function deps(sequence: readonly DiceValue[]): EngineDeps {
  return { diceRoller: new SequenceDiceRoller(sequence) };
}

function expectOk(result: EngineResult): Extract<EngineResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Expected ok, got error ${result.error.code}: ${result.error.message}`);
  }
  return result;
}

function expectError(result: EngineResult): ErrorCode {
  if (result.ok) {
    throw new Error('Expected an error result but the intent succeeded');
  }
  return result.error.code;
}

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    nickname: id,
    isReady: false,
    diceCount: 5,
    dice: [],
    consecutivePureStalls: 0,
    ...overrides,
  };
}

function makeBiddingState(
  players: Player[],
  round: Partial<RoundState> & { turnOrder: string[] },
): MatchState {
  return {
    phase: GamePhase.BIDDING,
    roomId: 'room-1',
    players,
    startRoll: null,
    completedStartRoll: null,
    winnerId: null,
    round: {
      roundNumber: 1,
      currentTurnIndex: 0,
      bidHistory: [],
      isSpecialRoundDeclared: false,
      pendingRolls: [],
      ...round,
    },
  };
}

describe('LOBBY — joining and readying up', () => {
  it('joins players, and starting the match requires everyone ready with at least the minimum player count', () => {
    const d = deps([6, 3]);
    let state = createInitialMatchState('room-1');
    state = expectOk(
      applyIntent(state, { type: 'JOIN_ROOM', playerId: 'p1', nickname: 'Alice' }, d),
    ).state;
    state = expectOk(
      applyIntent(state, { type: 'JOIN_ROOM', playerId: 'p2', nickname: 'Bob' }, d),
    ).state;
    expect(state.phase).toBe(GamePhase.LOBBY);

    state = expectOk(
      applyIntent(state, { type: 'SET_READY', playerId: 'p1', isReady: true }, d),
    ).state;
    expect(state.phase).toBe(GamePhase.LOBBY); // p2 not ready yet

    const result = applyIntent(state, { type: 'SET_READY', playerId: 'p2', isReady: true }, d);
    const { state: started, events } = expectOk(result);
    expect(started.phase).toBe(GamePhase.START_ROLL);
    expect(events.some((e) => e.type === 'MATCH_STARTED')).toBe(true);
  });

  it('rejects joining beyond the configured room capacity', () => {
    const d = deps([]);
    let state = createInitialMatchState('room-1');
    for (let i = 0; i < 12; i += 1) {
      state = expectOk(
        applyIntent(state, { type: 'JOIN_ROOM', playerId: `p${i}`, nickname: `P${i}` }, d),
      ).state;
    }
    const result = applyIntent(
      state,
      { type: 'JOIN_ROOM', playerId: 'overflow', nickname: 'Nope' },
      d,
    );
    expect(expectError(result)).toBe(ErrorCode.ROOM_FULL);
  });

  it('rejects an intent that is not legal in the current phase', () => {
    const d = deps([]);
    const state = createInitialMatchState('room-1');
    const result = applyIntent(
      state,
      { type: 'PLACE_BID', playerId: 'p1', bid: normalBid(1, 2) },
      d,
    );
    expect(expectError(result)).toBe(ErrorCode.WRONG_PHASE);
  });
});

describe('START_ROLL (5.2) — highest die goes first, ties re-roll among the tied', () => {
  it('resolves the decisive roll into ROUND_ROLLING, not BIDDING, with no private hands dealt', () => {
    const d = deps([4, 6, 2]);
    let state = createInitialMatchState('room-1');
    for (const id of ['p1', 'p2', 'p3']) {
      state = expectOk(
        applyIntent(state, { type: 'JOIN_ROOM', playerId: id, nickname: id }, d),
      ).state;
    }
    for (const id of ['p1', 'p2', 'p3']) {
      state = expectOk(
        applyIntent(state, { type: 'SET_READY', playerId: id, isReady: true }, d),
      ).state;
    }
    expect(state.phase).toBe(GamePhase.START_ROLL);

    state = expectOk(applyIntent(state, { type: 'ROLL_DICE', playerId: 'p1' }, d)).state; // rolls 4
    // Partial: only p1 has rolled — the public in-progress map holds just that, and the
    // completed/debug field isn't set until the whole thing resolves.
    expect(state.startRoll?.rolls).toEqual({ p1: 4 });
    expect(state.completedStartRoll).toBeNull();

    state = expectOk(applyIntent(state, { type: 'ROLL_DICE', playerId: 'p2' }, d)).state; // rolls 6
    expect(state.completedStartRoll).toBeNull();

    const { state: afterLast, events } = expectOk(
      applyIntent(state, { type: 'ROLL_DICE', playerId: 'p3' }, d),
    ); // rolls 2

    // Into ROUND_ROLLING, not straight to BIDDING — every active player must still manually roll
    // their own hand (5.3).
    expect(afterLast.phase).toBe(GamePhase.ROUND_ROLLING);
    expect(events.some((e) => e.type === 'ROUND_STARTED' && e.firstPlayerId === 'p2')).toBe(true);
    expect(afterLast.startRoll).toBeNull();
    // Final resolution: startRoll is cleared, but the complete decisive result is preserved
    // publicly for temporary debug visibility (retained through round 1's ROUND_ROLLING/BIDDING).
    expect(afterLast.completedStartRoll).toEqual({
      rolls: { p1: 4, p2: 6, p3: 2 },
      firstPlayerId: 'p2',
    });

    const round = afterLast.round;
    expect(round?.turnOrder).toEqual(['p2', 'p3', 'p1']);
    expect(round?.currentTurnIndex).toBe(0);
    expect(round?.bidHistory).toEqual([]);
    // No auto-deal: every active player still owes a manual hand roll.
    expect([...(round?.pendingRolls ?? [])].sort()).toEqual(['p1', 'p2', 'p3']);

    // No private hand was dealt for anyone yet.
    expect(afterLast.players.find((p) => p.id === 'p1')?.dice).toEqual([]);
    expect(afterLast.players.find((p) => p.id === 'p2')?.dice).toEqual([]);
    expect(afterLast.players.find((p) => p.id === 'p3')?.dice).toEqual([]);
  });

  it('makes the tied players re-roll among themselves, leaving the others out of it', () => {
    // p1 & p2 tie at 5; p3 rolled 3 and waits. Re-roll: p1=2, p2=6 -> p2 wins.
    const d = deps([5, 5, 3, 2, 6]);
    let state = createInitialMatchState('room-1');
    for (const id of ['p1', 'p2', 'p3']) {
      state = expectOk(
        applyIntent(state, { type: 'JOIN_ROOM', playerId: id, nickname: id }, d),
      ).state;
    }
    for (const id of ['p1', 'p2', 'p3']) {
      state = expectOk(
        applyIntent(state, { type: 'SET_READY', playerId: id, isReady: true }, d),
      ).state;
    }

    state = expectOk(applyIntent(state, { type: 'ROLL_DICE', playerId: 'p1' }, d)).state;
    state = expectOk(applyIntent(state, { type: 'ROLL_DICE', playerId: 'p2' }, d)).state;
    const { state: afterTieDetected, events: tieEvents } = expectOk(
      applyIntent(state, { type: 'ROLL_DICE', playerId: 'p3' }, d),
    );
    expect(afterTieDetected.phase).toBe(GamePhase.START_ROLL);
    expect([...(afterTieDetected.startRoll?.pendingPlayerIds ?? [])].sort()).toEqual(['p1', 'p2']);
    expect(tieEvents.some((e) => e.type === 'START_ROLL_TIED')).toBe(true);
    // The tied re-roll's own progress lives in the ordinary (live) startRoll.rolls, reset to
    // just the tied players — the discarded tied 5s are gone from it, and nothing is "completed"
    // yet since the match hasn't resolved.
    expect(afterTieDetected.startRoll?.rolls).toEqual({});
    expect(afterTieDetected.completedStartRoll).toBeNull();

    // p3 cannot roll again — they weren't part of the tie-break.
    expect(
      expectError(applyIntent(afterTieDetected, { type: 'ROLL_DICE', playerId: 'p3' }, d)),
    ).toBe(ErrorCode.ALREADY_ROLLED);

    state = expectOk(applyIntent(afterTieDetected, { type: 'ROLL_DICE', playerId: 'p1' }, d)).state; // rerolls 2
    expect(state.completedStartRoll).toBeNull();
    const { state: resolved } = expectOk(
      applyIntent(state, { type: 'ROLL_DICE', playerId: 'p2' }, d), // rerolls 6
    );
    expect(resolved.phase).toBe(GamePhase.ROUND_ROLLING);
    expect(resolved.round?.turnOrder[0]).toBe('p2');
    expect([...(resolved.round?.pendingRolls ?? [])].sort()).toEqual(['p1', 'p2', 'p3']);
    // Only the decisive reroll (p1: 2, p2: 6) is retained — neither the discarded tied 5s nor
    // p3's un-tied 3 leak into the completed public result.
    expect(resolved.completedStartRoll).toEqual({ rolls: { p1: 2, p2: 6 }, firstPlayerId: 'p2' });
    // No private hand dealt for anyone yet.
    expect(resolved.players.find((p) => p.id === 'p1')?.dice).toEqual([]);
    expect(resolved.players.find((p) => p.id === 'p2')?.dice).toEqual([]);
    expect(resolved.players.find((p) => p.id === 'p3')?.dice).toEqual([]);
  });

  it('clears the round-1 opening-roll debug result once round 1 ends', () => {
    // Opening rolls p1=4, p2=6 (p2 wins, no tie), then round-1 hands: p1 all aces, p2 all twos.
    const d = deps([4, 6, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    let state = createInitialMatchState('room-1');
    for (const id of ['p1', 'p2']) {
      state = expectOk(
        applyIntent(state, { type: 'JOIN_ROOM', playerId: id, nickname: id }, d),
      ).state;
    }
    for (const id of ['p1', 'p2']) {
      state = expectOk(
        applyIntent(state, { type: 'SET_READY', playerId: id, isReady: true }, d),
      ).state;
    }
    state = expectOk(applyIntent(state, { type: 'ROLL_DICE', playerId: 'p1' }, d)).state;
    const { state: afterOpeningRoll } = expectOk(
      applyIntent(state, { type: 'ROLL_DICE', playerId: 'p2' }, d),
    );
    expect(afterOpeningRoll.phase).toBe(GamePhase.ROUND_ROLLING);
    expect(afterOpeningRoll.completedStartRoll).not.toBeNull();

    state = expectOk(applyIntent(afterOpeningRoll, { type: 'ROLL_DICE', playerId: 'p1' }, d)).state;
    const { state: afterLast } = expectOk(
      applyIntent(state, { type: 'ROLL_DICE', playerId: 'p2' }, d),
    );
    expect(afterLast.phase).toBe(GamePhase.BIDDING);
    // Still round 1, now bidding — the debug view survives both manual hand rolls.
    expect(afterLast.completedStartRoll).not.toBeNull();

    const currentPlayerId = afterLast.round?.turnOrder[afterLast.round.currentTurnIndex] as string;
    const { state: afterBid } = expectOk(
      applyIntent(
        afterLast,
        { type: 'PLACE_BID', playerId: currentPlayerId, bid: normalBid(1, 2) },
        d,
      ),
    );
    // Still round 1, still bidding — the debug view survives a bid being placed.
    expect(afterBid.completedStartRoll).not.toBeNull();

    const nextPlayerId = afterBid.round?.turnOrder[afterBid.round.currentTurnIndex] as string;
    const { state: afterRoundEnds } = expectOk(
      applyIntent(afterBid, { type: 'CALL_LIAR', playerId: nextPlayerId }, d),
    );
    // Round 1 has now ended (win or loss either way) — the debug view's job is done.
    expect(afterRoundEnds.completedStartRoll).toBeNull();
  });
});

describe('ROUND_ROLLING (5.3, 4.5) — every active player must manually roll their own hand', () => {
  it('gives each player only their own dice and advances to BIDDING once all have rolled', () => {
    const d = deps([3, 3, 5, 1, 1, 3, 4, 4, 6, 1]);
    const players = [makePlayer('p1'), makePlayer('p2')];
    const state: MatchState = {
      phase: GamePhase.ROUND_ROLLING,
      roomId: 'room-1',
      players,
      startRoll: null,
      completedStartRoll: null,
      winnerId: null,
      round: {
        roundNumber: 2,
        turnOrder: ['p1', 'p2'],
        currentTurnIndex: 0,
        bidHistory: [],
        isSpecialRoundDeclared: false,
        pendingRolls: ['p1', 'p2'],
      },
    };

    const afterP1 = expectOk(applyIntent(state, { type: 'ROLL_DICE', playerId: 'p1' }, d));
    expect(afterP1.state.phase).toBe(GamePhase.ROUND_ROLLING);
    expect(afterP1.state.players.find((p) => p.id === 'p1')?.dice).toEqual([3, 3, 5, 1, 1]);
    expect(afterP1.state.players.find((p) => p.id === 'p2')?.dice).toEqual([]);

    // p1 cannot roll again on p2's behalf, or their own hand a second time.
    expect(expectError(applyIntent(afterP1.state, { type: 'ROLL_DICE', playerId: 'p1' }, d))).toBe(
      ErrorCode.ALREADY_ROLLED,
    );
    expect(afterP1.state.phase).toBe(GamePhase.ROUND_ROLLING);

    const afterP2 = expectOk(applyIntent(afterP1.state, { type: 'ROLL_DICE', playerId: 'p2' }, d));
    expect(afterP2.state.phase).toBe(GamePhase.BIDDING);
    expect(afterP2.state.players.find((p) => p.id === 'p2')?.dice).toEqual([3, 4, 4, 6, 1]);
  });
});

describe('BIDDING — turn order and bid legality', () => {
  it('rejects a bid from a player who is not up', () => {
    const players = [makePlayer('p1'), makePlayer('p2')];
    const state = makeBiddingState(players, { turnOrder: ['p1', 'p2'] });
    const result = applyIntent(
      state,
      { type: 'PLACE_BID', playerId: 'p2', bid: normalBid(1, 3) },
      deps([]),
    );
    expect(expectError(result)).toBe(ErrorCode.NOT_YOUR_TURN);
  });

  it('accepts 4x5 as the first bid of the round for the current player, and rejects it out of turn', () => {
    const players = [makePlayer('p1'), makePlayer('p2')];
    const state = makeBiddingState(players, { turnOrder: ['p1', 'p2'] });

    const outOfTurn = applyIntent(
      state,
      { type: 'PLACE_BID', playerId: 'p2', bid: normalBid(4, 5) },
      deps([]),
    );
    expect(expectError(outOfTurn)).toBe(ErrorCode.NOT_YOUR_TURN);

    const { state: after } = expectOk(
      applyIntent(state, { type: 'PLACE_BID', playerId: 'p1', bid: normalBid(4, 5) }, deps([])),
    );
    expect(after.round?.bidHistory).toEqual([{ playerId: 'p1', bid: normalBid(4, 5) }]);
    expect(after.round?.currentTurnIndex).toBe(1);
  });

  it('rejects an illegal bid and accepts a legal one, advancing the turn', () => {
    const players = [makePlayer('p1'), makePlayer('p2')];
    const bidHistory: BidRecord[] = [{ playerId: 'p1', bid: normalBid(4, 4) }];
    const state = makeBiddingState(players, {
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 1,
      bidHistory,
    });

    const illegal = applyIntent(
      state,
      { type: 'PLACE_BID', playerId: 'p2', bid: normalBid(3, 6) },
      deps([]),
    );
    expect(expectError(illegal)).toBe(ErrorCode.ILLEGAL_BID);

    const legal = expectOk(
      applyIntent(state, { type: 'PLACE_BID', playerId: 'p2', bid: normalBid(4, 5) }, deps([])),
    );
    expect(legal.state.round?.currentTurnIndex).toBe(0);
    expect(legal.state.round?.bidHistory).toHaveLength(2);
  });

  it('cannot call liar before any bid has been placed', () => {
    const players = [makePlayer('p1'), makePlayer('p2')];
    const state = makeBiddingState(players, { turnOrder: ['p1', 'p2'] });
    const result = applyIntent(state, { type: 'CALL_LIAR', playerId: 'p1' }, deps([]));
    expect(expectError(result)).toBe(ErrorCode.NO_BID_TO_CHALLENGE);
  });
});

describe('CALL_LIAR -> reveal -> round end (5.3, 4.5)', () => {
  it('the caller loses a die on an exact or exceeded count, and the loser (still active) goes first next round', () => {
    const p1 = makePlayer('p1', { dice: [3, 3, 5, 1, 1] }); // two 3s, two aces
    const p2 = makePlayer('p2', { dice: [3, 4, 4, 6, 1] }); // one 3, one ace
    const bidHistory: BidRecord[] = [
      { playerId: 'p1', bid: normalBid(2, 3) },
      { playerId: 'p2', bid: normalBid(3, 4) },
    ];
    const state = makeBiddingState([p1, p2], {
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      bidHistory,
    });

    // claimed: 3 fours. actual fours (wild): 2 literal fours + 3 aces = 5 >= 3 -> caller (p1) loses.
    const { state: after, events } = expectOk(
      applyIntent(state, { type: 'CALL_LIAR', playerId: 'p1' }, deps([])),
    );

    const revealEvent = events.find((e) => e.type === 'ROUND_REVEALED');
    expect(revealEvent).toMatchObject({
      outcome: 'CALLER_LOSES',
      loserId: 'p1',
      actualQuantity: 5,
    });
    expect(after.players.find((p) => p.id === 'p1')?.diceCount).toBe(4);
    expect(after.phase).toBe(GamePhase.ROUND_ROLLING);
    expect(after.round?.roundNumber).toBe(2);
    expect(after.round?.turnOrder[0]).toBe('p1'); // loser goes first next round
    expect(after.players.every((p) => p.dice.length === 0)).toBe(true); // hands cleared for the new round
  });

  it('the bidder loses when the actual count is below the claim, and skips to the next player in seat order if eliminated', () => {
    const p1 = makePlayer('p1', { dice: [2, 2, 2, 2, 2] });
    const p2 = makePlayer('p2', { diceCount: 1, dice: [5] }); // will be eliminated
    const p3 = makePlayer('p3', { dice: [6, 6, 6, 6, 6] });
    const bidHistory: BidRecord[] = [{ playerId: 'p2', bid: normalBid(4, 5) }]; // claims 4 fives; only 0 exist among all dice
    const state = makeBiddingState([p1, p2, p3], {
      turnOrder: ['p2', 'p3', 'p1'],
      currentTurnIndex: 1,
      bidHistory,
    });

    const { state: after, events } = expectOk(
      applyIntent(state, { type: 'CALL_LIAR', playerId: 'p3' }, deps([])),
    );
    expect(events.some((e) => e.type === 'PLAYER_ELIMINATED' && e.playerId === 'p2')).toBe(true);
    const updatedP2 = after.players.find((p) => p.id === 'p2');
    expect(updatedP2?.diceCount).toBe(0);
    // p2 is eliminated, seating order is p1,p2,p3 -> next active player after p2 is p3.
    expect(after.round?.turnOrder[0]).toBe('p3');
  });
});

describe('special round (5.5)', () => {
  it('only a player with exactly one die may declare it, and only before the first bid', () => {
    const p1 = makePlayer('p1', { diceCount: 1 });
    const p2 = makePlayer('p2', { diceCount: 3 });
    const state = makeBiddingState([p1, p2], { turnOrder: ['p1', 'p2'] });

    expect(
      expectError(applyIntent(state, { type: 'DECLARE_SPECIAL_ROUND', playerId: 'p2' }, deps([]))),
    ).toBe(ErrorCode.SPECIAL_ROUND_UNAVAILABLE);

    const { state: declared } = expectOk(
      applyIntent(state, { type: 'DECLARE_SPECIAL_ROUND', playerId: 'p1' }, deps([])),
    );
    expect(declared.round?.isSpecialRoundDeclared).toBe(true);

    const afterFirstBid = makeBiddingState([p1, p2], {
      turnOrder: ['p1', 'p2'],
      bidHistory: [{ playerId: 'p1', bid: normalBid(1, 3) }],
    });
    expect(
      expectError(
        applyIntent(afterFirstBid, { type: 'DECLARE_SPECIAL_ROUND', playerId: 'p1' }, deps([])),
      ),
    ).toBe(ErrorCode.SPECIAL_ROUND_UNAVAILABLE);
  });

  it('once declared, aces stop being wild for the reveal count', () => {
    const p1 = makePlayer('p1', { diceCount: 1, dice: [1] });
    const p2 = makePlayer('p2', { dice: [3, 3, 3, 3, 3] });
    const bidHistory: BidRecord[] = [{ playerId: 'p1', bid: normalBid(4, 3) }];
    const state = makeBiddingState([p1, p2], {
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 1,
      bidHistory,
      isSpecialRoundDeclared: true,
    });

    // Without wild aces, actual threes = 5 (all from p2) since p1's ace no longer counts as a three.
    const { events } = expectOk(
      applyIntent(state, { type: 'CALL_LIAR', playerId: 'p2' }, deps([])),
    );
    const revealEvent = events.find((e) => e.type === 'ROUND_REVEALED');
    expect(revealEvent).toMatchObject({
      actualQuantity: 5,
      outcome: 'CALLER_LOSES',
      loserId: 'p2',
    });
  });
});

describe('turn timeout and double-loss protection (5.7)', () => {
  it('a pure stall loses a die the first time', () => {
    const p1 = makePlayer('p1');
    const p2 = makePlayer('p2');
    const state = makeBiddingState([p1, p2], { turnOrder: ['p1', 'p2'] });

    const { state: after, events } = expectOk(applyTimeout(state, 'p1'));
    expect(events.some((e) => e.type === 'TURN_TIMED_OUT' && e.dieLost === true)).toBe(true);
    expect(after.players.find((p) => p.id === 'p1')?.diceCount).toBe(4);
    expect(after.players.find((p) => p.id === 'p1')?.consecutivePureStalls).toBe(1);
    expect(after.phase).toBe(GamePhase.ROUND_ROLLING); // the round ended immediately
  });

  it('is protected the second consecutive round, then vulnerable again the third time', () => {
    const p1 = makePlayer('p1', { consecutivePureStalls: 1, diceCount: 4 }); // already stalled once
    const p2 = makePlayer('p2');
    const state = makeBiddingState([p1, p2], { turnOrder: ['p1', 'p2'] });

    const { state: protectedState, events } = expectOk(applyTimeout(state, 'p1'));
    expect(events.some((e) => e.type === 'TURN_TIMED_OUT' && e.dieLost === false)).toBe(true);
    expect(protectedState.players.find((p) => p.id === 'p1')?.diceCount).toBe(4); // unchanged
    expect(protectedState.players.find((p) => p.id === 'p1')?.consecutivePureStalls).toBe(0);
    expect(protectedState.phase).toBe(GamePhase.BIDDING); // round continues, turn just passes
    expect(protectedState.round?.turnOrder[protectedState.round.currentTurnIndex]).toBe('p2');

    // Simulate this same player's turn timing out again next round (protection was consumed).
    const p1Again = protectedState.players.find((p) => p.id === 'p1') as Player;
    const nextRoundState = makeBiddingState([p1Again, p2], { turnOrder: ['p1', 'p2'] });
    const { state: thirdTime } = expectOk(applyTimeout(nextRoundState, 'p1'));
    expect(thirdTime.players.find((p) => p.id === 'p1')?.diceCount).toBe(3);
  });

  it('placing a bid resets the stall streak', () => {
    const p1 = makePlayer('p1', { consecutivePureStalls: 1 });
    const p2 = makePlayer('p2');
    const state = makeBiddingState([p1, p2], { turnOrder: ['p1', 'p2'] });
    const { state: after } = expectOk(
      applyIntent(state, { type: 'PLACE_BID', playerId: 'p1', bid: normalBid(1, 3) }, deps([])),
    );
    expect(after.players.find((p) => p.id === 'p1')?.consecutivePureStalls).toBe(0);
  });
});

describe('match win (5.9)', () => {
  it('declares the last player with dice remaining the winner', () => {
    const p1 = makePlayer('p1', { diceCount: 1, dice: [2] });
    const p2 = makePlayer('p2', { diceCount: 3, dice: [6, 6, 6] });
    const bidHistory: BidRecord[] = [{ playerId: 'p1', bid: normalBid(4, 6) }]; // only 3 sixes actually exist -> bidder loses
    const state = makeBiddingState([p1, p2], {
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 1,
      bidHistory,
    });

    const { state: after, events } = expectOk(
      applyIntent(state, { type: 'CALL_LIAR', playerId: 'p2' }, deps([])),
    );
    expect(events.some((e) => e.type === 'MATCH_WON' && e.winnerId === 'p2')).toBe(true);
    expect(after.phase).toBe(GamePhase.GAME_OVER);
    expect(after.winnerId).toBe('p2');
    expect(after.round).toBeNull();
  });
});
