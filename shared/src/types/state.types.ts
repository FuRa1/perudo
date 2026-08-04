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
}

/** 5.2 — the openly-rolled single die used to decide who bids first in round 1. */
export interface StartRollState {
  readonly pendingPlayerIds: readonly string[];
  readonly rolls: Readonly<Record<string, DiceValue>>;
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
  readonly round: RoundState | null;
  readonly winnerId: string | null;
}
