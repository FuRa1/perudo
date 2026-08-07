/**
 * Centralized rules constants (CLAUDE.md 3.4). No magic numbers outside this file —
 * both /client and /server import RULES_CONFIG instead of redeclaring these values.
 */
export const RULES_CONFIG = {
  startingDicePerPlayer: 5,
  players: {
    min: 2,
    max: 12,
  },
  turnTimer: {
    /** 0–15,000 ms: the player thinks, no signal. */
    quietPhaseEndMs: 15_000,
    /** 15,000–25,000 ms: the "yellow zone" audible warning. */
    audiblePhaseEndMs: 25_000,
    /** After this many ms the personal time bank starts being spent. */
    baseTurnMs: 25_000,
    /** Fixed personal extra-time bank; does not regenerate in the MVP. */
    personalBankMs: 30_000,
  },
  specialRoundBonusTimerMs: 7_000,
  reconnectWaitWindowMs: 60_000,
} as const;

export type RulesConfig = typeof RULES_CONFIG;
