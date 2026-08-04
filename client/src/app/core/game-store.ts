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
  /** Most recent reveal, kept until the next round starts so the UI can show it (5.3). */
  readonly lastReveal = signal<Extract<ServerEvent, { type: 'ROUND_REVEALED' }> | null>(null);
  /** Player IDs currently showing the cosmetic "rolling" animation (8.2) — set on the public
   * roll event, cleared a fixed short delay later regardless of when the state update lands, so
   * the animation always plays even on a fast local connection. Never implies a value. */
  readonly rollingPlayerIds = signal<ReadonlySet<string>>(new Set());
  private static readonly ROLL_ANIMATION_MS = 500;

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
      this.lastReveal.set(revealed);
    }
    const roundStarted = events.some((e) => e.type === 'ROUND_STARTED');
    if (roundStarted) {
      this.lastReveal.set(null);
    }
    for (const event of events) {
      if (event.type === 'START_ROLL_ROLLED' || event.type === 'PLAYER_ROLLED_HAND') {
        this.markRolling(event.playerId);
      }
    }
  }

  private markRolling(playerId: string): void {
    this.rollingPlayerIds.update((current) => new Set(current).add(playerId));
    setTimeout(() => {
      this.rollingPlayerIds.update((current) => {
        const next = new Set(current);
        next.delete(playerId);
        return next;
      });
    }, GameStore.ROLL_ANIMATION_MS);
  }

  setError(error: GameError): void {
    this.lastError.set(error);
  }

  clearError(): void {
    this.lastError.set(null);
  }
}
