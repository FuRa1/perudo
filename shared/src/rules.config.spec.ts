import { RULES_CONFIG } from './rules.config';

describe('RULES_CONFIG', () => {
  it('matches the values fixed in CLAUDE.md 3.4', () => {
    expect(RULES_CONFIG.startingDicePerPlayer).toBe(5);
    expect(RULES_CONFIG.players).toEqual({ min: 2, max: 12 });
    expect(RULES_CONFIG.turnTimer).toEqual({
      quietPhaseEndMs: 15_000,
      audiblePhaseEndMs: 25_000,
      baseTurnMs: 25_000,
      personalBankMs: 30_000,
    });
    expect(RULES_CONFIG.specialRoundBonusTimerMs).toBe(7_000);
    expect(RULES_CONFIG.reconnectWaitWindowMs).toBe(60_000);
  });
});
