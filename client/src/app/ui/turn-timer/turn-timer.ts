import { Component, OnDestroy, computed, effect, input, signal } from '@angular/core';
import type { TurnTimerView } from '@shared';
import { computeTurnTimerDisplay, type TurnTimerDisplay } from './turn-timer.util';
import { playWarningBeep } from './warning-beep';

const TICK_MS = 250;

/**
 * Server-synchronized countdown (5.6, 6.5) — presentation only. Every timestamp it reads comes
 * from the server's `TurnTimerView`; this component never decides anything, it only re-renders
 * on a local interval so the numbers visibly tick between snapshots. Plays the warning beep
 * exactly once per turn, the instant the locally-computed phase first reaches "warning".
 */
@Component({
  selector: 'app-turn-timer',
  standalone: true,
  templateUrl: './turn-timer.html',
  styleUrl: './turn-timer.scss',
})
export class TurnTimer implements OnDestroy {
  readonly timer = input<TurnTimerView | null>(null);
  readonly isMine = input(false);

  private readonly nowMs = signal(Date.now());
  private readonly tickHandle = setInterval(() => this.nowMs.set(Date.now()), TICK_MS);
  private lastBeepedTurnStartedAt: number | null = null;

  protected readonly display = computed<TurnTimerDisplay | null>(() => {
    const timer = this.timer();
    return timer ? computeTurnTimerDisplay(timer, this.nowMs()) : null;
  });

  protected readonly secondsRemaining = computed(() => {
    const display = this.display();
    return display ? Math.max(0, Math.ceil(display.msRemaining / 1000)) : null;
  });

  constructor() {
    // 5.6 describes the warning beep as the acting player's own signal that their time is running
    // out — not a broadcast to the whole table. isMine was previously accepted as an input and
    // never read, so every connected client played the beep on every turn, including for a player
    // (or an eliminated spectator, 2026-09-04) who has no clock of their own to be warned about.
    effect(() => {
      const timer = this.timer();
      const display = this.display();
      if (!timer || !this.isMine() || display?.phase !== 'warning') {
        return;
      }
      if (this.lastBeepedTurnStartedAt === timer.turnStartedAt) {
        return;
      }
      this.lastBeepedTurnStartedAt = timer.turnStartedAt;
      playWarningBeep();
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.tickHandle);
  }
}
