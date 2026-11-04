import { GamePhase, type MatchState, type Player } from '@shared';
import { buildPlayerView } from './player-view';
import { EMPTY_RECAP } from './room-recap';

function player(id: string, dice: Player['dice']): Player {
  return {
    id,
    nickname: id,
    isReady: true,
    diceCount: dice.length,
    dice,
    consecutivePureStalls: 0,
  };
}

const biddingState: MatchState = {
  phase: GamePhase.BIDDING,
  roomId: 'ROOM1',
  players: [player('alice', [2, 2, 2]), player('bob', [6, 5, 4])],
  startRoll: null,
  winnerId: null,
  round: {
    roundNumber: 1,
    turnOrder: ['alice', 'bob'],
    currentTurnIndex: 1,
    bidHistory: [],
    isSpecialRoundDeclared: false,
    pendingRolls: [],
  },
};

describe('buildPlayerView — anti-cheat filtering (4.5)', () => {
  const source = {
    state: biddingState,
    recap: EMPTY_RECAP,
    connectedPlayerIds: new Set(['alice']),
  };

  it("gives a player their own hand and never anyone else's", () => {
    const view = buildPlayerView(source, 'alice');
    expect(view.myDice).toEqual([2, 2, 2]);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('"dice"');
    expect(serialized).not.toContain('[6,5,4]');
  });

  it('exposes only dice counts for every seat', () => {
    const view = buildPlayerView(source, 'bob');
    expect(view.myDice).toEqual([6, 5, 4]);
    expect(view.players.map((p) => Object.keys(p).sort())).toEqual([
      ['diceCount', 'id', 'isConnected', 'isReady', 'nickname'],
      ['diceCount', 'id', 'isConnected', 'isReady', 'nickname'],
    ]);
  });

  it('reports whose turn it is and who is connected', () => {
    const view = buildPlayerView(source, 'alice');
    expect(view.round?.currentPlayerId).toBe('bob');
    expect(view.players.map((p) => p.isConnected)).toEqual([true, false]);
  });

  it('shows no current player while hands are still being rolled', () => {
    const rolling = { ...source, state: { ...biddingState, phase: GamePhase.ROUND_ROLLING } };
    expect(buildPlayerView(rolling, 'alice').round?.currentPlayerId).toBeNull();
  });
});
