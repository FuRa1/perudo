import type { Bid } from '@shared/types/bid.types';
import type { DiceValue } from '@shared/types/dice.types';
import type { RoundOutcome } from '@shared/types/round.types';
import type { BidRecord, GamePhase } from '@shared/types/state.types';

/**
 * What one player is allowed to see (CLAUDE.md 4.5, 6.6). Built by the server per recipient;
 * other players' hidden dice are never part of it — only their counts.
 */
export interface PublicPlayerView {
  readonly id: string;
  readonly nickname: string;
  readonly isReady: boolean;
  readonly diceCount: number;
  readonly isConnected: boolean;
  /** Optional avatar slot (3.5) — unused in the MVP. */
  readonly avatarId?: string;
}

export interface StartRollView {
  readonly pendingPlayerIds: readonly string[];
  /** Start-roll dice are rolled openly (5.2), so these are public. */
  readonly rolls: Readonly<Record<string, DiceValue>>;
  /** Set while re-rolling after a tie: who tied, and what they rolled last time. */
  readonly previousTie: {
    readonly tiedPlayerIds: readonly string[];
    readonly rolls: Readonly<Record<string, DiceValue>>;
  } | null;
}

export interface RoundView {
  readonly roundNumber: number;
  readonly turnOrder: readonly string[];
  /** Whose turn it is in BIDDING; null while players are still rolling. */
  readonly currentPlayerId: string | null;
  /** Full bid history — the client needs it to pre-validate with the shared validator (5.8). */
  readonly bidHistory: readonly BidRecord[];
  readonly isSpecialRoundDeclared: boolean;
  readonly pendingRolls: readonly string[];
}

/** Outcome of the round that just ended — public information once it is revealed. */
export type RoundResultView =
  | {
      readonly kind: 'REVEAL';
      readonly roundNumber: number;
      readonly callerId: string;
      readonly bidderId: string;
      readonly claimedBid: Bid;
      readonly actualQuantity: number;
      readonly outcome: RoundOutcome;
      readonly loserId: string;
      readonly wasSpecialRound: boolean;
      /** Everyone's dice — revealed, so safe to broadcast now (4.5). */
      readonly dice: Readonly<Record<string, readonly DiceValue[]>>;
    }
  | {
      readonly kind: 'TIMEOUT';
      readonly roundNumber: number;
      readonly playerId: string;
      readonly isDieLost: boolean;
    };

export interface PlayerView {
  readonly roomId: string;
  readonly phase: GamePhase;
  /** The recipient of this snapshot. */
  readonly selfId: string;
  /** Stable seating order, eliminated players included (diceCount 0). */
  readonly players: readonly PublicPlayerView[];
  /** The recipient's own hidden hand — the only hidden dice this snapshot ever contains. */
  readonly myDice: readonly DiceValue[];
  readonly startRoll: StartRollView | null;
  readonly round: RoundView | null;
  readonly lastResult: RoundResultView | null;
  /** Who won the starting roll — shown on the first round, then irrelevant. */
  readonly startRollWinnerId: string | null;
  readonly winnerId: string | null;
}
