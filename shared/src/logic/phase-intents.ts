import type { Intent } from '../types/intent.types';
import { GamePhase } from '../types/state.types';

/** Which intents are legal in which phase (CLAUDE.md 6.1). Anything else is WRONG_PHASE (4.2).
 * REVEAL and ROUND_END have no player-submittable intents — the engine passes through them
 * atomically as part of handling CALL_LIAR (see game-engine.ts). */
const PHASE_INTENT_TABLE: Readonly<Record<GamePhase, ReadonlySet<Intent['type']>>> = {
  [GamePhase.LOBBY]: new Set(['JOIN_ROOM', 'SET_READY']),
  [GamePhase.START_ROLL]: new Set(['ROLL_DICE']),
  [GamePhase.ROUND_ROLLING]: new Set(['ROLL_DICE']),
  [GamePhase.BIDDING]: new Set(['PLACE_BID', 'CALL_LIAR', 'DECLARE_SPECIAL_ROUND']),
  [GamePhase.REVEAL]: new Set(),
  [GamePhase.ROUND_END]: new Set(),
  [GamePhase.GAME_OVER]: new Set(),
};

export function isIntentAllowedInPhase(phase: GamePhase, intentType: Intent['type']): boolean {
  return PHASE_INTENT_TABLE[phase].has(intentType);
}
