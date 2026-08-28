import type { TurnTimerView } from '@shared';
import { computeTurnTimerDisplay } from './turn-timer.util';

function timer(overrides: Partial<TurnTimerView> = {}): TurnTimerView {
  return {
    playerId: 'p1',
    turnStartedAt: 0,
    quietPhaseEndsAt: 15_000,
    warningPhaseEndsAt: 25_000,
    bankDeadlineAt: 55_000,
    bankMsRemaining: 30_000,
    ...overrides,
  };
}

describe('computeTurnTimerDisplay', () => {
  it('reports the quiet phase before quietPhaseEndsAt', () => {
    expect(computeTurnTimerDisplay(timer(), 0)).toEqual({ phase: 'quiet', msRemaining: 15_000 });
    expect(computeTurnTimerDisplay(timer(), 14_999)).toEqual({ phase: 'quiet', msRemaining: 1 });
  });

  it('reports the warning phase between quietPhaseEndsAt and warningPhaseEndsAt', () => {
    expect(computeTurnTimerDisplay(timer(), 15_000)).toEqual({
      phase: 'warning',
      msRemaining: 10_000,
    });
    expect(computeTurnTimerDisplay(timer(), 24_999)).toEqual({ phase: 'warning', msRemaining: 1 });
  });

  it('reports the bank phase counting down to bankDeadlineAt once ticking', () => {
    expect(computeTurnTimerDisplay(timer(), 25_000)).toEqual({
      phase: 'bank',
      msRemaining: 30_000,
    });
    expect(computeTurnTimerDisplay(timer(), 54_999)).toEqual({ phase: 'bank', msRemaining: 1 });
  });

  it('reports expired once bankDeadlineAt has passed', () => {
    expect(computeTurnTimerDisplay(timer(), 55_000)).toEqual({ phase: 'expired', msRemaining: 0 });
    expect(computeTurnTimerDisplay(timer(), 60_000)).toEqual({ phase: 'expired', msRemaining: 0 });
  });

  it('shows the frozen bank budget with no live countdown while bankDeadlineAt is null (disconnected, 5.6)', () => {
    const paused = timer({ bankDeadlineAt: null, bankMsRemaining: 12_345 });
    expect(computeTurnTimerDisplay(paused, 40_000)).toEqual({
      phase: 'bank',
      msRemaining: 12_345,
    });
    // Even much later, still just reports the frozen budget — never derives "expired" on its own.
    expect(computeTurnTimerDisplay(paused, 500_000)).toEqual({
      phase: 'bank',
      msRemaining: 12_345,
    });
  });
});
