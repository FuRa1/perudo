import type { Bid } from './bid.types';
import type { DiceValue } from './dice.types';

/** Explicit round/match state machine (CLAUDE.md 6.1). REVEAL and ROUND_END are computed and
 * passed through atomically by the engine (there is no player intent that targets them — see
 * game-engine.ts) but are named here so the full FSM is documented in one place. */
export enum GamePhase {
  LOBBY = 'LOBBY',
  START_ROLL = 'START_ROLL',
  ROUND_ROLLING = 'ROUND_ROLLING',
  BIDDING = 'BIDDING',
  REVEAL = 'REVEAL',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER',
}

export interface Player {
  readonly id: string;
  readonly nickname: string;
  readonly isReady: boolean;
  readonly diceCount: number;
  /** This player's current hidden hand. Empty until they roll for the round (4.5, 5.3). */
  readonly dice: readonly DiceValue[];
  /** Consecutive rounds lost by pure timeout stall (no bid, no liar call) — 5.7 double-loss protection. */
  readonly consecutivePureStalls: number;
  /** The round this player lost their last die in — null while diceCount > 0, and once set never
   * changes (a match has no reinstatement). Only meaningful alongside diceCount === 0; nothing
   * derives one from the other, so both are set together wherever a player is eliminated. Exists
   * so the client can say "out in round N" without inventing a timestamp the model never had. */
  readonly eliminatedInRound: number | null;
}

/** 5.2 — the openly-rolled single die used to decide who bids first in round 1. */
export interface StartRollState {
  readonly pendingPlayerIds: readonly string[];
  readonly rolls: Readonly<Record<string, DiceValue>>;
}

/**
 * The resolved, decisive result of the 5.2 opening roll — public by rule, so it needs no
 * filtering in selectPlayerView. `rolls` holds only the winning sub-round's entries (a tie
 * resets `StartRollState.rolls` before rerolling among just the tied players, so this never
 * contains discarded pre-tie values — see game-engine.ts). Kept around through round 1's
 * ROUND_ROLLING and BIDDING purely as a temporary debugging aid (it is not itself game state
 * anything reads for rules), then cleared once round 1 ends.
 */
export interface CompletedStartRoll {
  readonly rolls: Readonly<Record<string, DiceValue>>;
  readonly firstPlayerId: string;
}

export interface BidRecord {
  readonly playerId: string;
  readonly bid: Bid;
}

export interface RoundState {
  readonly roundNumber: number;
  /** Active (diceCount > 0) player IDs in turn order for this round. */
  readonly turnOrder: readonly string[];
  readonly currentTurnIndex: number;
  /** Literal sequence of bids placed this round, oldest first (needed for the aces/sixes rule, 5.4). */
  readonly bidHistory: readonly BidRecord[];
  readonly isSpecialRoundDeclared: boolean;
  /** Active player IDs who still need to roll their hand before bidding can start (5.3). */
  readonly pendingRolls: readonly string[];
}

export interface MatchState {
  readonly phase: GamePhase;
  readonly roomId: string;
  /** Stable seating order for the whole match, including eliminated (diceCount === 0) players. */
  readonly players: readonly Player[];
  readonly startRoll: StartRollState | null;
  /** Temporary debug visibility for the resolved opening roll — see CompletedStartRoll. */
  readonly completedStartRoll: CompletedStartRoll | null;
  readonly round: RoundState | null;
  readonly winnerId: string | null;
}
