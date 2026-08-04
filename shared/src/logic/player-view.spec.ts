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
      round: null,
      winnerId: null,
    };
    selectPlayerView(state, 'someone-else');
    expect(state.players[0]?.dice).toEqual([1, 2, 3]);
  });
});
