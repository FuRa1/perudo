import { randomInt, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  GameEngine,
  GamePhase,
  RULES_CONFIG,
  gameError,
  type ActionResult,
  type DiceRoller,
  type EngineResult,
  type Intent,
  type JoinedRoom,
  type MatchState,
  type PlayerView,
} from '@shared';
import { DICE_ROLLER } from './crypto-dice-roller';
import { buildPlayerView, type ViewSource } from './player-view';
import { EMPTY_RECAP, applyEventsToRecap, type RoomRecap } from './room-recap';
import { SerialQueue } from './serial-queue';

interface Room extends ViewSource {
  state: MatchState;
  recap: RoomRecap;
  readonly connectedPlayerIds: Set<string>;
  readonly queue: SerialQueue;
}

export type RoomChangedListener = (roomId: string) => void;

export interface RecipientView {
  readonly playerId: string;
  readonly view: PlayerView;
}

function failure(code: ErrorCode, message: string): ActionResult<never> {
  return { ok: false, error: gameError(code, message) };
}

/**
 * In-memory room store (CLAUDE.md 3.3) and the only code that feeds intents into the GameEngine.
 * It knows nothing about sockets: a human behind the gateway and a future bot are both just
 * callers of {@link submitIntent} (3.5). Every room mutation runs through that room's queue.
 */
@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
  private readonly rooms = new Map<string, Room>();
  private readonly listeners = new Set<RoomChangedListener>();

  constructor(@Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller) {}

  onRoomChanged(listener: RoomChangedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createRoom(nickname: string): Promise<ActionResult<JoinedRoom>> {
    const roomId = this.generateRoomCode();
    this.rooms.set(roomId, {
      state: GameEngine.createInitialMatchState(roomId),
      recap: EMPTY_RECAP,
      connectedPlayerIds: new Set(),
      queue: new SerialQueue(),
    });
    return this.joinRoom(roomId, nickname);
  }

  joinRoom(roomId: string, nickname: string): Promise<ActionResult<JoinedRoom>> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return Promise.resolve(failure(ErrorCode.ROOM_NOT_FOUND, `Room ${roomId} does not exist.`));
    }
    const playerId = randomUUID();
    return room.queue.run(() => {
      const result = this.mutate(room, (state) =>
        GameEngine.applyIntent(state, { type: 'JOIN_ROOM', playerId, nickname }, this.deps()),
      );
      if (!result.ok) {
        return result;
      }
      room.connectedPlayerIds.add(playerId);
      return { ok: true, data: { roomId, playerId } };
    });
  }

  submitIntent(roomId: string, intent: Intent): Promise<ActionResult> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return Promise.resolve(failure(ErrorCode.ROOM_NOT_FOUND, `Room ${roomId} does not exist.`));
    }
    return room.queue.run(() =>
      this.mutate(room, (state) => GameEngine.applyIntent(state, intent, this.deps())),
    );
  }

  /**
   * In the lobby a dropped player frees their seat; after the start they keep it and are shown
   * offline (CLAUDE.md 7). Reconnect-by-token and the stall timer arrive in Phase 5 — until
   * then, a room whose last connection drops is discarded, as nobody can ever return to it.
   */
  disconnect(roomId: string, playerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return Promise.resolve();
    }
    return room.queue.run(() => {
      room.connectedPlayerIds.delete(playerId);
      if (room.connectedPlayerIds.size === 0) {
        this.rooms.delete(roomId);
        return;
      }
      if (
        room.state.players.some((p) => p.id === playerId) &&
        room.state.phase === GamePhase.LOBBY
      ) {
        this.mutate(room, (state) => GameEngine.removeLobbyPlayer(state, playerId));
        return;
      }
      this.notify(roomId);
    });
  }

  viewsFor(roomId: string): RecipientView[] {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }
    return [...room.connectedPlayerIds].map((playerId) => ({
      playerId,
      view: buildPlayerView(room, playerId),
    }));
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /** Applies one engine step atomically: on error nothing changes (4.2), on success state,
   * recap and listeners are updated together. An engine throw is contained, never fatal. */
  private mutate(room: Room, step: (state: MatchState) => EngineResult): ActionResult {
    let result: EngineResult;
    try {
      result = step(room.state);
    } catch (error: unknown) {
      this.logger.error(`Engine failure in room ${room.state.roomId}`, error);
      return failure(ErrorCode.INTERNAL_ERROR, 'Unexpected server error; nothing was changed.');
    }
    if (!result.ok) {
      return result;
    }
    room.recap = applyEventsToRecap(room.recap, room.state, result.events);
    room.state = result.state;
    this.notify(room.state.roomId);
    return { ok: true, data: null };
  }

  private notify(roomId: string): void {
    for (const listener of this.listeners) {
      listener(roomId);
    }
  }

  private deps(): { diceRoller: DiceRoller } {
    return { diceRoller: this.diceRoller };
  }

  private generateRoomCode(): string {
    const { codeAlphabet, codeLength } = RULES_CONFIG.room;
    let code: string;
    do {
      code = Array.from(
        { length: codeLength },
        () => codeAlphabet[randomInt(codeAlphabet.length)],
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
