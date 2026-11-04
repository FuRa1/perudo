import type { Bid } from './bid.types';
import type { DiceValue } from './dice.types';
import type { DieLossReason, RoundOutcome } from './round.types';

/** Domain events the engine emits alongside the new state (CLAUDE.md 6.3). Transport-agnostic —
 * the gateway (Phase 3) decides who receives which event and how it maps to a filtered snapshot. */
export interface PlayerJoinedEvent {
  readonly type: 'PLAYER_JOINED';
  readonly playerId: string;
  readonly nickname: string;
}

export interface PlayerReadyChangedEvent {
  readonly type: 'PLAYER_READY_CHANGED';
  readonly playerId: string;
  readonly isReady: boolean;
}

export interface MatchStartedEvent {
  readonly type: 'MATCH_STARTED';
}

export interface StartRollRolledEvent {
  readonly type: 'START_ROLL_ROLLED';
  readonly playerId: string;
  readonly value: DiceValue;
}

export interface StartRollTiedEvent {
  readonly type: 'START_ROLL_TIED';
  readonly tiedPlayerIds: readonly string[];
}

export interface RoundStartedEvent {
  readonly type: 'ROUND_STARTED';
  readonly roundNumber: number;
  readonly firstPlayerId: string;
}

export interface PlayerRolledHandEvent {
  readonly type: 'PLAYER_ROLLED_HAND';
  readonly playerId: string;
}

export interface BidPlacedEvent {
  readonly type: 'BID_PLACED';
  readonly playerId: string;
  readonly bid: Bid;
}

export interface SpecialRoundDeclaredEvent {
  readonly type: 'SPECIAL_ROUND_DECLARED';
  readonly playerId: string;
}

export interface LiarCalledEvent {
  readonly type: 'LIAR_CALLED';
  readonly callerId: string;
}

export interface RoundRevealedEvent {
  readonly type: 'ROUND_REVEALED';
  readonly dice: Readonly<Record<string, readonly DiceValue[]>>;
  readonly claimedBid: Bid;
  readonly bidderId: string;
  readonly actualQuantity: number;
  readonly outcome: RoundOutcome;
  readonly loserId: string;
}

export interface PlayerLostDieEvent {
  readonly type: 'PLAYER_LOST_DIE';
  readonly playerId: string;
  readonly reason: DieLossReason;
  readonly remainingDice: number;
}

export interface PlayerEliminatedEvent {
  readonly type: 'PLAYER_ELIMINATED';
  readonly playerId: string;
}

export interface MatchWonEvent {
  readonly type: 'MATCH_WON';
  readonly winnerId: string;
}

export interface TurnTimedOutEvent {
  readonly type: 'TURN_TIMED_OUT';
  readonly playerId: string;
  readonly dieLost: boolean;
}

export type ServerEvent =
  | PlayerJoinedEvent
  | PlayerReadyChangedEvent
  | MatchStartedEvent
  | StartRollRolledEvent
  | StartRollTiedEvent
  | RoundStartedEvent
  | PlayerRolledHandEvent
  | BidPlacedEvent
  | SpecialRoundDeclaredEvent
  | LiarCalledEvent
  | RoundRevealedEvent
  | PlayerLostDieEvent
  | PlayerEliminatedEvent
  | MatchWonEvent
  | TurnTimedOutEvent;
