import type { Bid } from './bid.types';

/**
 * Intent set (CLAUDE.md 6.2). `reconnect` is intentionally not modeled yet — session tokens and
 * slot restoration are Phase 5 (CLAUDE.md section 7); adding it now would be jumping ahead.
 */
export interface JoinRoomIntent {
  readonly type: 'JOIN_ROOM';
  readonly playerId: string;
  readonly nickname: string;
}

export interface SetReadyIntent {
  readonly type: 'SET_READY';
  readonly playerId: string;
  readonly isReady: boolean;
}

/** The shake gesture completing — server rolls dice, client only triggers the request (5.3). */
export interface RollDiceIntent {
  readonly type: 'ROLL_DICE';
  readonly playerId: string;
}

export interface PlaceBidIntent {
  readonly type: 'PLACE_BID';
  readonly playerId: string;
  readonly bid: Bid;
}

export interface CallLiarIntent {
  readonly type: 'CALL_LIAR';
  readonly playerId: string;
}

export interface DeclareSpecialRoundIntent {
  readonly type: 'DECLARE_SPECIAL_ROUND';
  readonly playerId: string;
}

export type Intent =
  | JoinRoomIntent
  | SetReadyIntent
  | RollDiceIntent
  | PlaceBidIntent
  | CallLiarIntent
  | DeclareSpecialRoundIntent;
