import { Injectable, inject } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import type { Bid, GameError, MatchState, ServerEvent } from '@shared';
import { GameStore } from './game-store';

// No deploy target chosen yet (CLAUDE.md section 12) — defaults to local dev, overridable via
// ?serverUrl=... (e.g. an ngrok tunnel URL) so the app can be shared for testing without a
// rebuild: <client-tunnel-url>/?serverUrl=<server-tunnel-url>.
const DEFAULT_SERVER_URL = 'http://localhost:3000';

function resolveServerUrl(): string {
  return new URLSearchParams(window.location.search).get('serverUrl') ?? DEFAULT_SERVER_URL;
}

interface JoinedPayload {
  playerId: string;
  roomId: string;
}

/**
 * The only place in /client that touches socket.io-client (3.2). Components call these methods
 * and read results from GameStore — they never see the socket itself.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly store = inject(GameStore);
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket) {
      return;
    }
    const socket = io(resolveServerUrl(), { transports: ['websocket'] });
    this.socket = socket;

    socket.on('connect', () => this.store.setConnected(true));
    socket.on('disconnect', () => this.store.setConnected(false));
    socket.on('joined', (payload: JoinedPayload) => this.store.setJoined(payload.playerId));
    socket.on('state', (state: MatchState) => this.store.setState(state));
    socket.on('events', (events: ServerEvent[]) => this.store.applyEvents(events));
    socket.on('error', (error: GameError) => this.store.setError(error));
  }

  joinRoom(roomId: string, nickname: string): void {
    this.socket?.emit('joinRoom', { roomId, nickname });
  }

  setReady(isReady: boolean): void {
    this.socket?.emit('setReady', { isReady });
  }

  rollDice(): void {
    this.socket?.emit('rollDice');
  }

  placeBid(bid: Bid): void {
    this.socket?.emit('placeBid', { bid });
  }

  callLiar(): void {
    this.socket?.emit('callLiar');
  }

  declareSpecialRound(): void {
    this.socket?.emit('declareSpecialRound');
  }
}
