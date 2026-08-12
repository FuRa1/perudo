import { Injectable, computed, signal } from '@angular/core';
import { GamePhase, type GameError, type MatchState, type ServerEvent } from '@shared';

/**
 * Single source of truth for what the server has told this client (6.6). Components read from
 * here via signals — they never touch SocketService or raw socket events directly.
 */
@Injectable({ providedIn: 'root' })
export class GameStore {
  readonly connected = signal(false);
  readonly playerId = signal<string | null>(null);
  readonly matchState = signal<MatchState | null>(null);
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

  setConnected(connected: boolean): void {
    this.connected.set(connected);
  }

  setJoined(playerId: string): void {
    this.playerId.set(playerId);
  }

  setState(state: MatchState): void {
    this.matchState.set(state);
  }

  applyEvents(events: readonly ServerEvent[]): void {
    const revealed = events.find((e) => e.type === 'ROUND_REVEALED');
    if (revealed) {
      this.lastRevealWasSpecialRound.set(this.matchState()?.round?.isSpecialRoundDeclared ?? false);
      this.lastReveal.set(revealed);
    }
  }

  setError(error: GameError): void {
    this.lastError.set(error);
  }

  clearError(): void {
    this.lastError.set(null);
  }
}
