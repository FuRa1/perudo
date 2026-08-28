import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { createInitialMatchState, type MatchState } from '@shared';
import { CryptoDiceRoller } from './crypto-dice-roller';

/** Server-internal bookkeeping for the current BIDDING turn's timer (Phase 5, 5.6/5.7/6.5).
 * Never sent to the client as-is — `TurnTimerService.buildView` derives the public
 * `TurnTimerView` from it. Owned/mutated exclusively by TurnTimerService. */
export interface ActiveTurnTimer {
  readonly playerId: string;
  readonly turnStartedAt: number;
  /** Extra ms granted by a special-round declaration (5.5), applied on top of the base timer. */
  bonusMs: number;
  /** Ms of personal bank budget not yet consumed. */
  bankMsRemaining: number;
  /** Epoch ms the bank last started/resumed ticking; null while not actively ticking (still in
   * the base 0-25s window, or the owner is currently disconnected). */
  bankResumedAt: number | null;
  /** Epoch ms this player went offline; null while connected (5.6: the bank is not spent
   * automatically while disconnected). */
  disconnectedSince: number | null;
  /** Bumped on every (re)start so a stale scheduled callback can recognize it no longer applies. */
  readonly generation: number;
  nodeHandle: ReturnType<typeof setTimeout> | null;
}

export interface RoomRuntime {
  state: MatchState;
  readonly diceRoller: CryptoDiceRoller;
  /** playerId -> live socket, for personalized snapshot delivery (4.5, 6.6). */
  readonly sockets: Map<string, Socket>;
  /** Promise chain each mutation attaches to, so a room's intents are handled strictly one at a
   * time (3.3) even though nothing here actually awaits mid-mutation today. */
  queue: Promise<unknown>;
  /** reconnect token -> playerId (section 7). Never sent to any client — only the token's
   * original owner ever learns it, via the 'joined' payload at join/reconnect time. */
  readonly sessionsByToken: Map<string, string>;
  /** The single active BIDDING-turn timer for this room, if any (5.6/5.7). */
  timer: ActiveTurnTimer | null;
}

/** Sufficiently random reconnect/session token (section 4.5/7) — 256 bits from Node's CSPRNG,
 * the same crypto module CryptoDiceRoller uses, just not through DiceRoller (this isn't dice
 * generation, 6.4's injected-RNG mandate doesn't apply to session tokens). */
export function createReconnectToken(): string {
  return randomBytes(32).toString('hex');
}

/** Match state lives in server memory only, keyed by roomId (3.3) — no DB in the MVP. */
@Injectable()
export class RoomsService {
  private readonly rooms = new Map<string, RoomRuntime>();

  getOrCreate(roomId: string): RoomRuntime {
    const existing = this.rooms.get(roomId);
    if (existing) {
      return existing;
    }
    const room: RoomRuntime = {
      state: createInitialMatchState(roomId),
      diceRoller: new CryptoDiceRoller(),
      sockets: new Map(),
      queue: Promise.resolve(),
      sessionsByToken: new Map(),
      timer: null,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  find(roomId: string): RoomRuntime | undefined {
    return this.rooms.get(roomId);
  }

  async runExclusive<T>(roomId: string, fn: (room: RoomRuntime) => T): Promise<T> {
    const room = this.getOrCreate(roomId);
    const result = room.queue.then(() => fn(room));
    room.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
