import { GamePhase } from '../types/state.types';
import { isIntentAllowedInPhase } from './phase-intents';

describe('isIntentAllowedInPhase (6.1 phase x intent table)', () => {
  it('LOBBY allows joining and readying up, nothing else', () => {
    expect(isIntentAllowedInPhase(GamePhase.LOBBY, 'JOIN_ROOM')).toBe(true);
    expect(isIntentAllowedInPhase(GamePhase.LOBBY, 'SET_READY')).toBe(true);
    expect(isIntentAllowedInPhase(GamePhase.LOBBY, 'PLACE_BID')).toBe(false);
    expect(isIntentAllowedInPhase(GamePhase.LOBBY, 'ROLL_DICE')).toBe(false);
  });

  it('START_ROLL and ROUND_ROLLING only allow ROLL_DICE', () => {
    expect(isIntentAllowedInPhase(GamePhase.START_ROLL, 'ROLL_DICE')).toBe(true);
    expect(isIntentAllowedInPhase(GamePhase.START_ROLL, 'PLACE_BID')).toBe(false);
    expect(isIntentAllowedInPhase(GamePhase.ROUND_ROLLING, 'ROLL_DICE')).toBe(true);
    expect(isIntentAllowedInPhase(GamePhase.ROUND_ROLLING, 'CALL_LIAR')).toBe(false);
  });

  it('BIDDING allows bidding, calling liar, and declaring a special round', () => {
    expect(isIntentAllowedInPhase(GamePhase.BIDDING, 'PLACE_BID')).toBe(true);
    expect(isIntentAllowedInPhase(GamePhase.BIDDING, 'CALL_LIAR')).toBe(true);
    expect(isIntentAllowedInPhase(GamePhase.BIDDING, 'DECLARE_SPECIAL_ROUND')).toBe(true);
    expect(isIntentAllowedInPhase(GamePhase.BIDDING, 'JOIN_ROOM')).toBe(false);
  });

  it('REVEAL, ROUND_END, and GAME_OVER accept no player intents', () => {
    for (const phase of [GamePhase.REVEAL, GamePhase.ROUND_END, GamePhase.GAME_OVER] as const) {
      expect(isIntentAllowedInPhase(phase, 'PLACE_BID')).toBe(false);
      expect(isIntentAllowedInPhase(phase, 'CALL_LIAR')).toBe(false);
      expect(isIntentAllowedInPhase(phase, 'ROLL_DICE')).toBe(false);
      expect(isIntentAllowedInPhase(phase, 'JOIN_ROOM')).toBe(false);
      expect(isIntentAllowedInPhase(phase, 'SET_READY')).toBe(false);
      expect(isIntentAllowedInPhase(phase, 'DECLARE_SPECIAL_ROUND')).toBe(false);
    }
  });
});
