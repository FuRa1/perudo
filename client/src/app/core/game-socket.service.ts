import { Injectable, signal } from '@angular/core';
import {
  CLIENT_EVENTS,
  ErrorCode,
  SERVER_EVENTS,
  gameError,
  type ActionResult,
  type PlayerView,
} from '@shared';
import { io, type Socket } from 'socket.io-client';
import { resolveServerUrl } from './server-url';

export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const ACK_TIMEOUT_MS = 8_000;

/**
 * The single place the client touches Socket.io (CLAUDE.md 3.2). Components never see a socket —
 * they go through {@link GameStore}, which uses this to send intents and receive snapshots.
 */
@Injectable({ providedIn: 'root' })
export class GameSocketService {
  readonly status = signal<ConnectionStatus>('disconnected');

  private socket: Socket | null = null;
  private stateListener: ((view: PlayerView) => void) | null = null;
  private disconnectListener: (() => void) | null = null;

  onState(listener: (view: PlayerView) => void): void {
    this.stateListener = listener;
  }

  onDisconnect(listener: () => void): void {
    this.disconnectListener = listener;
  }

  async send<T = null>(event: ClientEvent, payload: object = {}): Promise<ActionResult<T>> {
    try {
      const socket = await this.ensureConnected();
      return (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as ActionResult<T>;
    } catch {
      return {
        ok: false,
        error: gameError(ErrorCode.INTERNAL_ERROR, 'Cannot reach the game server.'),
      };
    }
  }

  /** Drops the connection — the server frees or keeps the seat depending on the phase. */
  disconnect(): void {
    // Detach first: an intentional leave must not be reported as a lost connection.
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.status.set('disconnected');
  }

  private ensureConnected(): Promise<Socket> {
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }
    const socket = this.socket ?? this.createSocket();
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error: Error) => reject(error));
    });
  }

  private createSocket(): Socket {
    this.status.set('connecting');
    // Reconnecting would land in a fresh, seatless connection until Phase 5 adds session tokens,
    // so a drop is surfaced to the store instead of retried silently.
    const socket = io(resolveServerUrl(window.location, window.localStorage), {
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => this.status.set('connected'));
    socket.on(SERVER_EVENTS.STATE, (view: PlayerView) => this.stateListener?.(view));
    socket.on('connect_error', () => this.handleDrop());
    socket.on('disconnect', () => this.handleDrop());
    this.socket = socket;
    return socket;
  }

  private handleDrop(): void {
    this.socket?.removeAllListeners();
    this.socket = null;
    this.status.set('disconnected');
    this.disconnectListener?.();
  }
}
