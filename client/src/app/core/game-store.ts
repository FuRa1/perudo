import { Injectable, computed, signal } from '@angular/core';
import { GamePhase, type GameError, type ServerEvent, type StateSnapshot } from '@shared';

/**
 * Single source of truth for what the server has told this client (6.6). Components read from
 * here via signals — they never touch SocketService or raw socket events directly.
 */
@Injectable({ providedIn: 'root' })
export class GameStore {
  readonly connected = signal(false);
  readonly playerId = signal<string | null>(null);
  readonly matchState = signal<StateSnapshot | null>(null);
  readonly lastError = signal<GameError | null>(null);
  /** Most recent reveal (5.3) — kept until superseded by the next one. Deliberately NOT cleared
   * on ROUND_STARTED: when a round continues, the engine emits ROUND_REVEALED and ROUND_STARTED
   * together in the very same events batch (finishRoundAfterLoss), so clearing it on
   * ROUND_STARTED would erase it in the same synchronous call that set it — no consumer would
   * ever observe it. Consumers that care about "is this reveal still fresh" (e.g. the round-loss
   * modal) track that themselves by object identity, not by relying on this being nulled. */
  readonly lastReveal = signal<Extract<ServerEvent, { type: 'ROUND_REVEALED' }> | null>(null);
  /** Whether the just-revealed round had the special round declared (5.5, aces not wild) —
   * `RoundRevealedEvent` itself doesn't carry this, and `matchState().round.isSpecialRoundDeclared`
   * can't be read for it after the fact either: the special round never carries into the next
   * round (5.5), so once the accompanying `state` message lands, that flag has already reset.
   * The server always sends `events` before `state` for the same batch (game.gateway.ts), so
   * `applyEvents` below runs while `matchState()` still holds the round that was just revealed —
   * this snapshots it right there, at the one moment it's still correct, rather than adding a
   * field to the event contract for a purely-client-presentational need. */
  readonly lastRevealWasSpecialRound = signal(false);
  /** Most recent die-losing timeout (5.7) — a pure stall has no reveal to show, so without this
   * a player who loses a die by simply running out of time gets no feedback at all (unlike a
   * call-liar loss, which RoundLossModal already surfaces). A *protected* stall (double-loss
   * protection, no die lost) is deliberately never set here — nothing to notify about. */
  readonly lastTimeout = signal<Extract<ServerEvent, { type: 'TURN_TIMED_OUT' }> | null>(null);
  /** True once a locally-stored reconnect session (section 7) turned out to be invalid/expired —
   * Entry shows a small, friendly explanation instead of the generic error toast, and instead of
   * silently dropping the player back to a blank form with no context (SocketService is the only
   * writer/clearer, see its own doc comment). */
  readonly sessionRestoreFailed = signal(false);

  readonly me = computed(() => {
    const state = this.matchState();
    const id = this.playerId();
    return state && id ? (state.players.find((p) => p.id === id) ?? null) : null;
  });

  readonly isMyTurn = computed(() => {
    const state = this.matchState();
    const id = this.playerId();
    if (!state?.round || !id) {
      return false;
    }
    return state.round.turnOrder[state.round.currentTurnIndex] === id;
  });

  readonly isLobby = computed(() => this.matchState()?.phase === GamePhase.LOBBY);
  readonly isGameOver = computed(() => this.matchState()?.phase === GamePhase.GAME_OVER);
  /** Server-authoritative turn-timer metadata (5.6/5.7/6.5) — presentation only; the client never
   * decides a timeout, it only displays this. Null whenever no BIDDING turn is active. */
  readonly turnTimer = computed(() => this.matchState()?.turnTimer ?? null);

  setConnected(connected: boolean): void {
    this.connected.set(connected);
  }

  setJoined(playerId: string): void {
    this.playerId.set(playerId);
    this.sessionRestoreFailed.set(false);
  }

  setSessionRestoreFailed(): void {
    this.sessionRestoreFailed.set(true);
  }

  clearSessionRestoreFailed(): void {
    this.sessionRestoreFailed.set(false);
  }

  setState(state: StateSnapshot): void {
    this.matchState.set(state);
  }

  applyEvents(events: readonly ServerEvent[]): void {
    const revealed = events.find((e) => e.type === 'ROUND_REVEALED');
    if (revealed) {
      this.lastRevealWasSpecialRound.set(this.matchState()?.round?.isSpecialRoundDeclared ?? false);
      this.lastReveal.set(revealed);
      return;
    }
    const timedOut = events.find((e) => e.type === 'TURN_TIMED_OUT' && e.dieLost);
    if (timedOut) {
      this.lastTimeout.set(timedOut as Extract<ServerEvent, { type: 'TURN_TIMED_OUT' }>);
    }
    // Once I've rolled my own hand for the new round, last round's reveal recap has done its
    // job — clearing it here (rather than on ROUND_STARTED, see the field's own doc comment)
    // means it never lingers, stacked above the roll button, all the way into the next round's
    // BIDDING. A no-op the many times this fires with no reveal yet to clear (e.g. round 1).
    const myId = this.playerId();
    if (myId && events.some((e) => e.type === 'PLAYER_ROLLED_HAND' && e.playerId === myId)) {
      this.lastReveal.set(null);
    }
  }

  setError(error: GameError): void {
    this.lastError.set(error);
  }

  clearError(): void {
    this.lastError.set(null);
  }

  /** Back to a clean slate, as if the app had just loaded. `playerId` is what app.html routes on,
   * so clearing it is what actually returns the player to the entry screen; the rest is cleared
   * alongside it so no fragment of the finished match (a stale reveal recap, a timeout modal, an
   * error toast) can survive into the next one. Purely local — the server is told separately. */
  resetMatch(): void {
    this.playerId.set(null);
    this.matchState.set(null);
    this.lastReveal.set(null);
    this.lastRevealWasSpecialRound.set(false);
    this.lastTimeout.set(null);
    this.lastError.set(null);
    this.sessionRestoreFailed.set(false);
  }
}
