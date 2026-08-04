import { GamePhase, type MatchState } from '@shared/types/state.types';
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

    const view = selectPlayerView(state, 'p1');
    expect(view.players.find((p) => p.id === 'p1')?.dice).toEqual([1, 2, 3]);
    expect(view.players.find((p) => p.id === 'p2')?.dice).toEqual([]);
    // diceCount stays visible for everyone — the table UI needs it.
    expect(view.players.find((p) => p.id === 'p2')?.diceCount).toBe(3);
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
    selectPlayerView(state, 'someone-else');
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

    const viewOfP1 = selectPlayerView(state, 'p1');
    const viewOfP2 = selectPlayerView(state, 'p2');

    expect(viewOfP1.startRoll).toEqual(state.startRoll);
    expect(viewOfP1.completedStartRoll).toEqual(state.completedStartRoll);
    // Same public data regardless of who's asking — opening rolls have no privacy rule (5.2).
    expect(viewOfP2.startRoll).toEqual(state.startRoll);
    expect(viewOfP2.completedStartRoll).toEqual(state.completedStartRoll);
  });
});
