import { Injectable, inject } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import type { Bid, GameError, ServerEvent, StateSnapshot } from '@shared';
import { GameStore } from './game-store';

// No deploy target chosen yet (CLAUDE.md section 12) — defaults to local dev, overridable via
// ?serverUrl=... (e.g. an ngrok tunnel URL) so the app can be shared for testing without a
// rebuild: <client-tunnel-url>/?serverUrl=<server-tunnel-url>. The native Android/iOS shell has no
// address bar to carry that query param and 'localhost' means the device itself, not the dev
// machine — SERVER_URL_STORAGE_KEY is the equivalent override there, editable from the Entry
// screen (native-only field) and persisted so it survives app restarts without a rebuild.
const DEFAULT_SERVER_URL = 'http://localhost:3000';
const SERVER_URL_STORAGE_KEY = 'perudo:serverUrl';

function resolveServerUrl(): string {
  const fromQuery = new URLSearchParams(window.location.search).get('serverUrl');
  if (fromQuery) {
    localStorage.setItem(SERVER_URL_STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  return localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? DEFAULT_SERVER_URL;
}

interface JoinedPayload {
  playerId: string;
  roomId: string;
  reconnectToken: string;
}

/** What's needed to silently rejoin an existing slot after a page reload/disconnect (section 7).
 * Kept in localStorage only — never sent anywhere except back to the server it came from. */
interface StoredSession {
  readonly roomId: string;
  readonly token: string;
}

const SESSION_STORAGE_KEY = 'perudo:session';

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return typeof parsed.roomId === 'string' && typeof parsed.token === 'string'
      ? { roomId: parsed.roomId, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * The only place in /client that touches socket.io-client (3.2). Components call these methods
 * and read results from GameStore — they never see the socket itself. Also owns the reconnect
 * session (section 7): the token handed back on `joined` is stored locally and replayed
 * automatically on the next connection, so a page reload or brief disconnect returns to the same
 * seat without the player re-entering anything.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly store = inject(GameStore);
  private socket: Socket | null = null;
  /** True only while a locally-stored session is being replayed — distinguishes "this INVALID_TOKEN
   * is just a stale/expired saved session, silently discard it" from a real user-facing error. */
  private reconnecting = false;

  connect(): void {
    if (this.socket) {
      return;
    }
    const socket = io(resolveServerUrl(), { transports: ['websocket'] });
    this.socket = socket;

    socket.on('connect', () => {
      this.store.setConnected(true);
      this.tryAutoReconnect();
    });
    socket.on('disconnect', () => this.store.setConnected(false));
    socket.on('joined', (payload: JoinedPayload) => {
      this.reconnecting = false;
      this.store.setJoined(payload.playerId);
      saveSession({ roomId: payload.roomId, token: payload.reconnectToken });
    });
    socket.on('state', (state: StateSnapshot) => this.store.setState(state));
    socket.on('events', (events: ServerEvent[]) => this.store.applyEvents(events));
    socket.on('error', (error: GameError) => {
      if (this.reconnecting) {
        // A saved session that no longer works (expired/unknown) — fall back to the entry
        // screen, with a small friendly note (GameStore.sessionRestoreFailed) rather than the
        // generic error toast, since the player didn't do anything wrong here.
        this.reconnecting = false;
        clearSession();
        this.store.setSessionRestoreFailed();
        return;
      }
      this.store.setError(error);
    });
  }

  private tryAutoReconnect(): void {
    const session = loadSession();
    if (!session) {
      return;
    }
    this.reconnecting = true;
    this.socket?.emit('reconnectToRoom', { roomId: session.roomId, token: session.token });
  }

  /** Current server URL a fresh `connect()` would use — the native Entry field's initial value. */
  getServerUrl(): string {
    return resolveServerUrl();
  }

  /** Native-only (see resolveServerUrl's doc comment): points the client at a different server
   * (e.g. a new ngrok tunnel URL) and reconnects immediately. Persisted so it survives an app
   * restart without editing again. */
  setServerUrl(url: string): void {
    const trimmed = url.trim();
    if (!trimmed || trimmed === resolveServerUrl()) {
      return;
    }
    localStorage.setItem(SERVER_URL_STORAGE_KEY, trimmed);
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.socket = null;
    this.store.setConnected(false);
    this.connect();
  }

  joinRoom(roomId: string, nickname: string): void {
    clearSession();
    this.store.clearSessionRestoreFailed();
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
