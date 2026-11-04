import {
  GamePhase,
  type MatchState,
  type Player,
  type PlayerView,
  type PublicPlayerView,
  type RoundView,
  type StartRollView,
} from '@shared';
import type { RoomRecap } from './room-recap';

/** Everything the view builder reads about a room — the room's state plus transport facts. */
export interface ViewSource {
  readonly state: MatchState;
  readonly recap: RoomRecap;
  readonly connectedPlayerIds: ReadonlySet<string>;
}

/** Fields are whitelisted, never spread from Player — `dice` must not leak by accident (4.5). */
function toPublicPlayer(player: Player, connected: ReadonlySet<string>): PublicPlayerView {
  return {
    id: player.id,
    nickname: player.nickname,
    isReady: player.isReady,
    diceCount: player.diceCount,
    isConnected: connected.has(player.id),
  };
}

function toRoundView(state: MatchState): RoundView | null {
  const round = state.round;
  if (!round) {
    return null;
  }
  const isBidding = state.phase === GamePhase.BIDDING;
  return {
    roundNumber: round.roundNumber,
    turnOrder: round.turnOrder,
    currentPlayerId: isBidding ? (round.turnOrder[round.currentTurnIndex] ?? null) : null,
    bidHistory: round.bidHistory,
    isSpecialRoundDeclared: round.isSpecialRoundDeclared,
    pendingRolls: round.pendingRolls,
  };
}

function toStartRollView(state: MatchState, recap: RoomRecap): StartRollView | null {
  if (!state.startRoll) {
    return null;
  }
  return {
    pendingPlayerIds: state.startRoll.pendingPlayerIds,
    rolls: state.startRoll.rolls,
    previousTie: recap.previousTie,
  };
}

/**
 * The filtered snapshot for one recipient (6.6): full public state, plus only the viewer's own
 * hand. Other players' hidden dice reach a client only through a revealed round result.
 */
export function buildPlayerView(source: ViewSource, viewerId: string): PlayerView {
  const { state, recap, connectedPlayerIds } = source;
  const viewer = state.players.find((p) => p.id === viewerId);
  return {
    roomId: state.roomId,
    phase: state.phase,
    selfId: viewerId,
    players: state.players.map((p) => toPublicPlayer(p, connectedPlayerIds)),
    myDice: viewer?.dice ?? [],
    startRoll: toStartRollView(state, recap),
    round: toRoundView(state),
    lastResult: recap.lastResult,
    startRollWinnerId: recap.startRollWinnerId,
    winnerId: state.winnerId,
  };
}
