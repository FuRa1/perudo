import { TestBed } from '@angular/core/testing';
import { TurnTimer } from './turn-timer';
import type { TurnTimerView } from '@shared';

/** jsdom (the test environment) has no real Web Audio API, so `playWarningBeep` (warning-
 * beep.ts) already no-ops there via its own `!AudioCtx` guard — this stub exists only so the
 * beep test below can observe "an AudioContext was constructed" as a proxy for "the beep would
 * have played" in a real browser, without mocking a relative import (unsupported by the Angular
 * unit-test system's Vitest integration). */
class FakeAudioContext {
  static constructionCount = 0;
  readonly currentTime = 0;
  constructor() {
    FakeAudioContext.constructionCount += 1;
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect: () => ({ connect: () => undefined }),
      start: () => undefined,
      stop: () => undefined,
      onended: null as (() => void) | null,
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
    };
  }
  close() {
    return Promise.resolve();
  }
}

function timer(overrides: Partial<TurnTimerView> = {}): TurnTimerView {
  return {
    playerId: 'p1',
    turnStartedAt: Date.now(),
    quietPhaseEndsAt: Date.now() + 15_000,
    warningPhaseEndsAt: Date.now() + 25_000,
    bankDeadlineAt: Date.now() + 55_000,
    bankMsRemaining: 30_000,
    ...overrides,
  };
}

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(TurnTimer);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  const nativeElement = fixture.nativeElement as HTMLElement;
  return { fixture, nativeElement, text: nativeElement.textContent ?? '' };
}

describe('TurnTimer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TurnTimer] });
  });

  it('renders nothing when there is no active timer', () => {
    const { nativeElement } = render({ timer: null });
    expect(nativeElement.querySelector('.turn-timer')).toBeNull();
  });

  it('renders the quiet phase for a freshly-started turn', () => {
    const { nativeElement } = render({ timer: timer() });
    const badge = nativeElement.querySelector('.turn-timer');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain('turn-timer--quiet');
  });

  it('renders the warning phase and plays the beep exactly once for that turn, for the acting player', () => {
    const original = (window as unknown as { AudioContext?: unknown }).AudioContext;
    FakeAudioContext.constructionCount = 0;
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    try {
      const startedAt = Date.now() - 16_000; // already 16s in — past the 15s quiet boundary
      const { fixture, nativeElement } = render({
        isMine: true,
        timer: timer({
          turnStartedAt: startedAt,
          quietPhaseEndsAt: startedAt + 15_000,
          warningPhaseEndsAt: startedAt + 25_000,
          bankDeadlineAt: startedAt + 55_000,
        }),
      });
      fixture.detectChanges();
      expect(nativeElement.querySelector('.turn-timer')?.className).toContain(
        'turn-timer--warning',
      );
      expect(FakeAudioContext.constructionCount).toBe(1);

      // A further tick while still in the warning phase for the SAME turn must not beep again.
      fixture.detectChanges();
      expect(FakeAudioContext.constructionCount).toBe(1);
    } finally {
      (window as unknown as { AudioContext: unknown }).AudioContext = original;
    }
  });

  it("never beeps for a turn that is not the local player's own (5.6 — the signal is per-player, not per-table)", () => {
    const original = (window as unknown as { AudioContext?: unknown }).AudioContext;
    FakeAudioContext.constructionCount = 0;
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    try {
      const startedAt = Date.now() - 16_000;
      const { fixture, nativeElement } = render({
        isMine: false,
        timer: timer({
          turnStartedAt: startedAt,
          quietPhaseEndsAt: startedAt + 15_000,
          warningPhaseEndsAt: startedAt + 25_000,
          bankDeadlineAt: startedAt + 55_000,
        }),
      });
      fixture.detectChanges();
      expect(nativeElement.querySelector('.turn-timer')?.className).toContain(
        'turn-timer--warning',
      );
      expect(FakeAudioContext.constructionCount).toBe(0);
    } finally {
      (window as unknown as { AudioContext: unknown }).AudioContext = original;
    }
  });

  it('shows the bank phase as frozen (no live countdown) once bankDeadlineAt is null (disconnected, 5.6)', () => {
    const startedAt = Date.now() - 40_000; // well past both quiet and warning
    const { nativeElement } = render({
      timer: timer({
        turnStartedAt: startedAt,
        quietPhaseEndsAt: startedAt + 15_000,
        warningPhaseEndsAt: startedAt + 25_000,
        bankDeadlineAt: null,
        bankMsRemaining: 12_345,
      }),
    });
    const badge = nativeElement.querySelector('.turn-timer');
    expect(badge?.className).toContain('turn-timer--bank');
    expect(badge?.textContent).toContain('13s'); // ceil(12345 / 1000)
  });
});
