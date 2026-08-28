import { GamePhase, type MatchState } from '@shared/types/state.types';
import { RULES_CONFIG } from '@shared/rules.config';
import { selectPlayerView } from './player-view';

function player(id: string, dice: number[]): MatchState['players'][number] {
  return {
    id,
    nickname: id,
    isReady: true,
    diceCount: dice.length || 5,
    dice: dice as MatchState['players'][number]['dice'],
    consecutivePureStalls: 0,
  };
}

describe('selectPlayerView (4.5, 6.6)', () => {
  it("keeps the viewer's own dice but blanks everyone else's", () => {
    const state: MatchState = {
      phase: GamePhase.BIDDING,
      roomId: 'room-1',
      players: [player('p1', [1, 2, 3]), player('p2', [4, 5, 6])],
      startRoll: null,
      completedStartRoll: null,
      round: null,
      winnerId: null,
    };

    const view = selectPlayerView(state, 'p1', null);
    expect(view.players.find((p) => p.id === 'p1')?.dice).toEqual([1, 2, 3]);
    expect(view.players.find((p) => p.id === 'p2')?.dice).toEqual([]);
    // diceCount stays visible for everyone — the table UI needs it.
    expect(view.players.find((p) => p.id === 'p2')?.diceCount).toBe(3);
  });

  it('attaches the given turnTimer view unfiltered, and null when there is none', () => {
    const state: MatchState = {
      phase: GamePhase.BIDDING,
      roomId: 'room-1',
      players: [player('p1', [1])],
      startRoll: null,
      completedStartRoll: null,
      round: null,
      winnerId: null,
    };
    const timer = {
      playerId: 'p1',
      turnStartedAt: 1000,
      quietPhaseEndsAt: 16000,
      warningPhaseEndsAt: 26000,
      bankDeadlineAt: 56000,
      bankMsRemaining: 30000,
    };
    expect(selectPlayerView(state, 'p1', timer).turnTimer).toEqual(timer);
    expect(selectPlayerView(state, 'p1', null).turnTimer).toBeNull();
  });

  it('does not mutate the original state', () => {
    const state: MatchState = {
      phase: GamePhase.BIDDING,
      roomId: 'room-1',
      players: [player('p1', [1, 2, 3])],
      startRoll: null,
      completedStartRoll: null,
      round: null,
      winnerId: null,
    };
    selectPlayerView(state, 'someone-else', null);
    expect(state.players[0]?.dice).toEqual([1, 2, 3]);
  });

  it('passes public opening-roll data through unchanged for every viewer (5.2 is public)', () => {
    const state: MatchState = {
      phase: GamePhase.ROUND_ROLLING,
      roomId: 'room-1',
      players: [player('p1', []), player('p2', [])],
      startRoll: { pendingPlayerIds: ['p2'], rolls: { p1: 5 } },
      completedStartRoll: { rolls: { p1: 6, p2: 4 }, firstPlayerId: 'p1' },
      round: null,
      winnerId: null,
    };

    const viewOfP1 = selectPlayerView(state, 'p1', null);
    const viewOfP2 = selectPlayerView(state, 'p2', null);

    expect(viewOfP1.startRoll).toEqual(state.startRoll);
    expect(viewOfP1.completedStartRoll).toEqual(state.completedStartRoll);
    // Same public data regardless of who's asking — opening rolls have no privacy rule (5.2).
    expect(viewOfP2.startRoll).toEqual(state.startRoll);
    expect(viewOfP2.completedStartRoll).toEqual(state.completedStartRoll);
  });

  it('hides round-1 auto-dealt hands from opponents even while the opening-roll debug view is still shown', () => {
    // Round 1 now enters BIDDING with hands already dealt (no manual roll step) — the debug
    // opening-roll result is public, but each player's hand must still be private to them alone.
    const state: MatchState = {
      phase: GamePhase.BIDDING,
      roomId: 'room-1',
      players: [player('p1', [1, 1, 1, 1, 1]), player('p2', [2, 2, 2, 2, 2])],
      startRoll: null,
      completedStartRoll: { rolls: { p1: 4, p2: 6 }, firstPlayerId: 'p2' },
      round: {
        roundNumber: 1,
        turnOrder: ['p2', 'p1'],
        currentTurnIndex: 0,
        bidHistory: [],
        isSpecialRoundDeclared: false,
        pendingRolls: [],
      },
      winnerId: null,
    };

    const viewOfP1 = selectPlayerView(state, 'p1', null);
    expect(viewOfP1.players.find((p) => p.id === 'p1')?.dice).toEqual([1, 1, 1, 1, 1]);
    expect(viewOfP1.players.find((p) => p.id === 'p1')?.dice).toHaveLength(
      RULES_CONFIG.startingDicePerPlayer,
    );
    expect(viewOfP1.players.find((p) => p.id === 'p2')?.dice).toEqual([]);
    expect(viewOfP1.completedStartRoll).toEqual(state.completedStartRoll);

    const viewOfP2 = selectPlayerView(state, 'p2', null);
    expect(viewOfP2.players.find((p) => p.id === 'p2')?.dice).toEqual([2, 2, 2, 2, 2]);
    expect(viewOfP2.players.find((p) => p.id === 'p2')?.dice).toHaveLength(
      RULES_CONFIG.startingDicePerPlayer,
    );
    expect(viewOfP2.players.find((p) => p.id === 'p1')?.dice).toEqual([]);
  });
});
