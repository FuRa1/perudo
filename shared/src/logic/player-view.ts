import type { MatchState } from '@shared/types/state.types';
import type { StateSnapshot, TurnTimerView } from '@shared/types/timer.types';

/**
 * The filtered snapshot sent to one player (4.5, 6.6): everyone's `diceCount` stays visible (the
 * table UI needs it), but only the viewer's own `dice` values are — everyone else's are blanked
 * out. This is the only place in the whole state shape that needs filtering; bid history, the
 * open starting roll, etc. are public by rule and pass through untouched. `turnTimer` (Phase 5,
 * 6.5) is identical for every viewer — it carries no private information — so it is simply
 * attached, not filtered.
 */
export function selectPlayerView(
  state: MatchState,
  viewerId: string,
  turnTimer: TurnTimerView | null,
): StateSnapshot {
  return {
    ...state,
    turnTimer,
    players: state.players.map((player) =>
      player.id === viewerId ? player : { ...player, dice: [] },
    ),
  };
}
