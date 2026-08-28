import { Injectable, Logger } from '@nestjs/common';
import { RULES_CONFIG, type TurnTimerView } from '@shared';
import type { ActiveTurnTimer, RoomRuntime } from './rooms.service';
import { RoomsService } from './rooms.service';
import { TimerConfigService, type TimerConfig } from './timer-config.service';

/** Invoked (inside the room's serialized mutation queue, 3.3) whenever a turn's time genuinely
 * runs out — either the personal bank was exhausted while connected, or the hard disconnect
 * fallback (below) elapsed. The handler is responsible for calling `applyTimeout` and
 * broadcasting; TurnTimerService only decides *when* to call it. */
export type TimeoutFiredHandler = (room: RoomRuntime, playerId: string) => void;

let generationCounter = 0;

/**
 * Server-authoritative turn timer (5.6, 5.7, 6.5) — owns the wall-clock scheduling that decides
 * when a BIDDING turn times out. Deliberately outside GameEngine (6.3: the engine has no clock),
 * and deliberately outside the client (6.5: the client can only display an approximation, never
 * decide).
 *
 * Disconnect handling (5.6/section 7 — resolved ambiguity, see AGENTS.md phase-5 status note):
 * the base 0-25s window always elapses on schedule regardless of connection, and the personal
 * bank is only ever spent while the turn's owner is actually connected — pausing on disconnect,
 * resuming on reconnect, exactly as 5.6 describes. Because AGENTS.md's "no voting/kick" stance
 * (section 7) combined with "the bank is not spent automatically on disconnect" would otherwise
 * let a permanently-absent active player stall the match forever, a disconnected player's turn
 * is additionally bounded by `RULES_CONFIG.reconnectWaitWindowMs` (60s) counted from the moment
 * they went offline: if they have not reconnected by then, the ordinary timeout action fires
 * (5.7, including double-loss protection) so the match always keeps moving. Their reconnect
 * token itself never expires — this only resolves the stalled turn, not their ability to
 * rejoin later.
 */
@Injectable()
export class TurnTimerService {
  private readonly logger = new Logger(TurnTimerService.name);
  private handler: TimeoutFiredHandler | null = null;
  private timerConfig: TimerConfig;

  constructor(
    private readonly rooms: RoomsService,
    private readonly timerConfigService: TimerConfigService,
  ) {
    this.timerConfig = timerConfigService.getTimerConfig();
  }

  setTimeoutHandler(handler: TimeoutFiredHandler): void {
    this.handler = handler;
  }

  /** Starts a fresh timer for `playerId`'s BIDDING turn, replacing whatever timer (if any) was
   * previously active for this room. If the player is already disconnected the moment their
   * turn begins (e.g. they were made the next round's first bidder while offline), the timer
   * starts directly in the disconnected/fallback state. */
  startTimer(room: RoomRuntime, playerId: string): void {
    // Check if timers are disabled before starting timer
    if (!this.timerConfig.enabled) {
      return;
    }
    this.cancelTimer(room);
    const now = Date.now();
    const timer: ActiveTurnTimer = {
      playerId,
      turnStartedAt: now,
      bonusMs: 0,
      bankMsRemaining: this.timerConfig.personalBankMs,
      bankResumedAt: null,
      disconnectedSince: room.sockets.has(playerId) ? null : now,
      generation: (generationCounter += 1),
      nodeHandle: null,
    };
    room.timer = timer;
    this.reschedule(room, timer);
  }

  /** Cancels and discards the room's active timer, if any (round transition, GAME_OVER). */
  cancelTimer(room: RoomRuntime): void {
    if (room.timer?.nodeHandle) {
      clearTimeout(room.timer.nodeHandle);
    }
    room.timer = null;
  }

  /** Applies the 5.5 special-round 7-second bonus to whichever timer is currently active — always
   * the round's first player's own first-bid timer, since a declaration can only ever succeed
   * while that exact timer is running (bidHistory is still empty). A no-op while disconnected:
   * the bonus is defined in terms of "the first-bid timer", a different clock than the
   * disconnect hard-fallback below, so it does not extend the fallback deadline. */
  extendForSpecialRound(room: RoomRuntime): void {
    const timer = room.timer;
    if (!timer || timer.disconnectedSince !== null) {
      return;
    }
    const now = Date.now();
    this.catchUpBankIfDue(timer, now);
    if (timer.bankResumedAt !== null) {
      timer.bankMsRemaining += this.timerConfig.specialRoundBonusTimerMs;
    } else {
      timer.bonusMs += this.timerConfig.specialRoundBonusTimerMs;
    }
    this.reschedule(room, timer);
  }

  /** Freezes the bank (if it was ticking) and switches the active timer into the disconnect
   * hard-fallback schedule. A no-op unless `playerId` is the timer's own owner — another
   * player disconnecting never affects the active turn's timer. */
  onPlayerDisconnected(room: RoomRuntime, playerId: string): void {
    const timer = room.timer;
    if (!timer || timer.playerId !== playerId || timer.disconnectedSince !== null) {
      return;
    }
    const now = Date.now();
    this.catchUpBankIfDue(timer, now);
    if (timer.bankResumedAt !== null) {
      timer.bankMsRemaining = Math.max(0, timer.bankMsRemaining - (now - timer.bankResumedAt));
      timer.bankResumedAt = null;
    }
    timer.disconnectedSince = now;
    this.reschedule(room, timer);
  }

  /** Resumes ticking (from *now*, never backdated — the whole disconnected interval is excluded
   * from the bank per 5.6) and cancels the disconnect hard-fallback. A no-op unless `playerId`
   * is the timer's own owner and it was actually paused. */
  onPlayerReconnected(room: RoomRuntime, playerId: string): void {
    const timer = room.timer;
    if (!timer || timer.playerId !== playerId || timer.disconnectedSince === null) {
      return;
    }
    const now = Date.now();
    const baseDeadline = timer.turnStartedAt + RULES_CONFIG.turnTimer.baseTurnMs + timer.bonusMs;
    timer.disconnectedSince = null;
    timer.bankResumedAt = now >= baseDeadline ? now : null;
    this.reschedule(room, timer);
  }

  /** Builds the public, client-facing view of the room's active timer (or null). Identical for
   * every viewer — carries no private information. */
  buildView(room: RoomRuntime): TurnTimerView | null {
    const timer = room.timer;
    if (!timer) {
      return null;
    }
    const now = Date.now();
    this.catchUpBankIfDue(timer, now);
    const { quietPhaseEndMs, audiblePhaseEndMs } = this.timerConfig;
    const liveBankRemaining =
      timer.bankResumedAt !== null
        ? Math.max(0, timer.bankMsRemaining - (now - timer.bankResumedAt))
        : timer.bankMsRemaining;
    return {
      playerId: timer.playerId,
      turnStartedAt: timer.turnStartedAt,
      quietPhaseEndsAt: timer.turnStartedAt + quietPhaseEndMs + timer.bonusMs,
      warningPhaseEndsAt: timer.turnStartedAt + audiblePhaseEndMs + timer.bonusMs,
      bankDeadlineAt: timer.disconnectedSince === null ? this.computeScheduledAt(timer) : null,
      bankMsRemaining: liveBankRemaining,
    };
  }

  /**
   * Lazily backdates `bankResumedAt` to the base deadline the first time anything notices the
   * base window has elapsed while connected and nothing has paused it yet. Only valid when the
   * connection has been continuous since the timer started — callers that just resumed from a
   * disconnect (`onPlayerReconnected`) set `bankResumedAt` themselves instead, to `now` rather
   * than the (already-elapsed, and partly spent offline) base deadline. Idempotent: once set,
   * later calls are no-ops.
   */
  private catchUpBankIfDue(timer: ActiveTurnTimer, now: number): void {
    if (timer.disconnectedSince !== null || timer.bankResumedAt !== null) {
      return;
    }
    const baseDeadline = timer.turnStartedAt + RULES_CONFIG.turnTimer.baseTurnMs + timer.bonusMs;
    if (now >= baseDeadline) {
      timer.bankResumedAt = baseDeadline;
    }
  }

  /** The single wall-clock deadline at which this timer's next consequential action (an ordinary
   * bank timeout, or the disconnect hard-fallback) should fire — recomputed fresh from current
   * state every time, never accumulated incrementally, so it can never drift out of sync with
   * `timer`'s own fields. Assumes any due catch-up has already run (see `catchUpBankIfDue`). */
  private computeScheduledAt(timer: ActiveTurnTimer): number {
    if (timer.disconnectedSince !== null) {
      return timer.disconnectedSince + this.timerConfig.reconnectWaitWindowMs;
    }
    if (timer.bankResumedAt !== null) {
      return timer.bankResumedAt + timer.bankMsRemaining;
    }
    const baseDeadline = timer.turnStartedAt + this.timerConfig.baseTurnMs + timer.bonusMs;
    return baseDeadline + timer.bankMsRemaining;
  }

  private reschedule(room: RoomRuntime, timer: ActiveTurnTimer): void {
    if (timer.nodeHandle) {
      clearTimeout(timer.nodeHandle);
    }
    const now = Date.now();
    this.catchUpBankIfDue(timer, now);
    const scheduledAt = this.computeScheduledAt(timer);
    const delay = Math.max(0, scheduledAt - now);
    const { generation, playerId } = timer;
    timer.nodeHandle = setTimeout(() => {
      this.fire(room, playerId, generation);
    }, delay);
  }

  /** Fires when a scheduled deadline is reached. Re-validates twice — once immediately (cheap,
   * avoids queuing pointless work) and once again inside the room's serialized mutation queue
   * (3.3) right before acting, since another mutation may have cancelled/replaced this exact
   * timer while this callback was waiting its turn in the queue. Either check failing means this
   * callback is stale and must do nothing (Phase 5 requirement). */
  private fire(room: RoomRuntime, playerId: string, generation: number): void {
    if (room.timer?.generation !== generation) {
      return;
    }
    void this.rooms.runExclusive(room.state.roomId, (freshRoom) => {
      if (freshRoom.timer?.generation !== generation || !this.handler) {
        return;
      }
      try {
        this.handler(freshRoom, playerId);
      } catch (error) {
        this.logger.error(`Error applying turn timeout for ${playerId}`, error as Error);
      }
    });
  }
}
