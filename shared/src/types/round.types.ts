/** Who loses a die once "liar" is called and dice are revealed (5.3). */
export type RoundOutcome = 'CALLER_LOSES' | 'BIDDER_LOSES';

/** Why a player lost a die — a liar-call outcome, or a turn timeout (5.7). */
export type DieLossReason = 'LIAR_OUTCOME' | 'TIMEOUT';
