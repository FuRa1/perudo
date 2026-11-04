import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RULES_CONFIG } from '@shared';

/** Acceleration (m/s², gravity excluded) above which the phone counts as being shaken. */
const MOTION_SHAKE_THRESHOLD = 12;

/**
 * The shake gesture (5.3, 8.2). Purely cosmetic: the animation never hints at a result — when
 * the gesture ends, the component only *asks* for a roll and the server generates the dice.
 * Works by press-and-hold (release to roll), keyboard, or physically shaking a phone; commits
 * after the phone is still for the threshold, or at the gesture's max duration.
 */
@Component({
  selector: 'app-shake-cup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="cup"
      [class.cup--shaking]="isShaking()"
      [disabled]="!isEnabled()"
      (pointerdown)="handlePressStart()"
      (pointerup)="handlePressEnd()"
      (pointerleave)="handlePressEnd()"
      (keydown.enter)="commit()"
      (keydown.space)="commit()"
    >
      <span class="cup-body" aria-hidden="true">🎲</span>
      <span class="cup-label">{{ isShaking() ? 'Release to roll!' : label() }}</span>
    </button>
  `,
  styles: `
    .cup {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      border-radius: 1rem;
      background: linear-gradient(#6b4423, #3d2412);
      border: 2px solid #c9a86a;
      color: #f3e3bf;
      font-weight: 700;
      touch-action: none;
      user-select: none;
    }
    .cup:disabled {
      opacity: 0.4;
    }
    .cup-body {
      font-size: 3rem;
      display: inline-block;
    }
    .cup--shaking .cup-body {
      animation: shake 0.15s infinite alternate;
    }
    @keyframes shake {
      from {
        transform: rotate(-14deg) translateX(-4px);
      }
      to {
        transform: rotate(14deg) translateX(4px);
      }
    }
  `,
})
export class ShakeCupComponent {
  readonly isEnabled = input(true);
  readonly label = input('Hold to shake');
  readonly rolled = output<void>();

  protected readonly isShaking = signal(false);
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private stillTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const motionListener = (event: DeviceMotionEvent): void => this.handleMotion(event);
    window.addEventListener('devicemotion', motionListener);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('devicemotion', motionListener);
      this.clearTimers();
    });
  }

  protected handlePressStart(): void {
    if (this.isEnabled()) {
      this.startShaking();
    }
  }

  protected handlePressEnd(): void {
    if (this.isShaking()) {
      this.commit();
    }
  }

  protected commit(): void {
    if (!this.isEnabled()) {
      return;
    }
    this.clearTimers();
    this.isShaking.set(false);
    this.rolled.emit();
  }

  private handleMotion(event: DeviceMotionEvent): void {
    const a = event.acceleration;
    if (!this.isEnabled() || !a) {
      return;
    }
    const magnitude = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    if (magnitude < MOTION_SHAKE_THRESHOLD) {
      return;
    }
    this.startShaking();
    if (this.stillTimer) {
      clearTimeout(this.stillTimer);
    }
    this.stillTimer = setTimeout(
      () => this.commit(),
      RULES_CONFIG.shakeGesture.stillnessThresholdToCommitMs,
    );
  }

  private startShaking(): void {
    if (this.isShaking()) {
      return;
    }
    this.isShaking.set(true);
    this.maxTimer = setTimeout(() => this.commit(), RULES_CONFIG.shakeGesture.maxDurationMs);
  }

  private clearTimers(): void {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
    }
    if (this.stillTimer) {
      clearTimeout(this.stillTimer);
    }
    this.maxTimer = null;
    this.stillTimer = null;
  }
}
