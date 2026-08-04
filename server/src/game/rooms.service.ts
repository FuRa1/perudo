import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { createInitialMatchState, type MatchState } from '@shared';
import { CryptoDiceRoller } from './crypto-dice-roller';

export interface RoomRuntime {
  state: MatchState;
  readonly diceRoller: CryptoDiceRoller;
  /** playerId -> live socket, for personalized snapshot delivery (4.5, 6.6). */
  readonly sockets: Map<string, Socket>;
  /** Promise chain each mutation attaches to, so a room's intents are handled strictly one at a
   * time (3.3) even though nothing here actually awaits mid-mutation today. */
  queue: Promise<unknown>;
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
