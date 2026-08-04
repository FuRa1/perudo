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
  }

  setError(error: GameError): void {
    this.lastError.set(error);
  }

  clearError(): void {
    this.lastError.set(null);
  }
}
