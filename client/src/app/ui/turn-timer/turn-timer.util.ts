import type { TurnTimerView } from '@shared';

/** Which phase of the 5.6 sequence the timer is currently showing (presentation only — the
 * server, not this, decides when a timeout actually fires). */
export type TurnTimerPhase = 'quiet' | 'warning' | 'bank' | 'expired';

export interface TurnTimerDisplay {
  readonly phase: TurnTimerPhase;
  /** Ms remaining until the next phase boundary (quiet/warning), or until timeout (bank). */
  readonly msRemaining: number;
}

/**
 * Derives what to show from server-provided epoch timestamps and the current wall clock —
 * pure and independently testable. `bankDeadlineAt` is null exactly when the bank is not
 * currently ticking (the active player is disconnected, 5.6): there is no live countdown to
 * show in that case, only the frozen `bankMsRemaining` budget.
 */
export function computeTurnTimerDisplay(timer: TurnTimerView, nowMs: number): TurnTimerDisplay {
  if (nowMs < timer.quietPhaseEndsAt) {
    return { phase: 'quiet', msRemaining: timer.quietPhaseEndsAt - nowMs };
  }
  if (nowMs < timer.warningPhaseEndsAt) {
    return { phase: 'warning', msRemaining: timer.warningPhaseEndsAt - nowMs };
  }
  if (timer.bankDeadlineAt === null) {
    return { phase: 'bank', msRemaining: timer.bankMsRemaining };
  }
  const msRemaining = timer.bankDeadlineAt - nowMs;
  return msRemaining > 0 ? { phase: 'bank', msRemaining } : { phase: 'expired', msRemaining: 0 };
}
