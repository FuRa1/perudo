import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  applyIntent,
  ErrorCode,
  gameError,
  selectPlayerView,
  type Bid,
  type EngineResult,
  type ServerEvent,
} from '@shared';
import type { RoomRuntime } from './rooms.service';
import { RoomsService } from './rooms.service';

interface JoinRoomPayload {
  roomId: string;
  nickname: string;
}

/** Which room/player a connected socket belongs to, once it has joined (bookkeeping only —
 * not part of game state). */
interface SocketContext {
  roomId: string;
  playerId: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const NORMAL_FACES: readonly number[] = [2, 3, 4, 5, 6];

function isValidBid(value: unknown): value is Bid {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.quantity !== 'number' || !Number.isInteger(candidate.quantity)) {
    return false;
  }
  if (candidate.kind === 'ACE') {
    return true;
  }
  if (candidate.kind === 'NORMAL') {
    return typeof candidate.face === 'number' && NORMAL_FACES.includes(candidate.face);
  }
  return false;
}

/** Thin transport layer over GameEngine (3.2, 6.3) — this class holds no game rules of its own,
 * it only translates socket messages into Intents and broadcasts the results. */
@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  private readonly contexts = new Map<string, SocketContext>();

  constructor(private readonly rooms: RoomsService) {}

  handleDisconnect(client: Socket): void {
    const context = this.contexts.get(client.id);
    this.contexts.delete(client.id);
    if (!context) {
      return;
    }
    const room = this.rooms.find(context.roomId);
    room?.sockets.delete(context.playerId);
    // No game-state effect on disconnect yet — the unified stall/disconnect timer is Phase 5.
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const body = payload as Partial<JoinRoomPayload> | undefined;
    if (!isNonEmptyString(body?.roomId) || !isNonEmptyString(body?.nickname)) {
      client.emit(
        'error',
        gameError(ErrorCode.PLAYER_NOT_FOUND, 'roomId and nickname are required.'),
      );
      return;
    }
    const { roomId, nickname } = body;
    const playerId = client.id;

    await this.rooms.runExclusive(roomId, (room) => {
      const result = applyIntent(
        room.state,
        { type: 'JOIN_ROOM', playerId, nickname },
        this.deps(room),
      );
      if (!result.ok) {
        client.emit('error', result.error);
        return;
      }
      room.state = result.state;
      room.sockets.set(playerId, client);
      this.contexts.set(client.id, { roomId, playerId });
      void client.join(roomId);
      client.emit('joined', { playerId, roomId });
      this.broadcast(roomId, room, result.events);
    });
  }

  @SubscribeMessage('setReady')
  async handleSetReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const isReady = (payload as { isReady?: unknown } | undefined)?.isReady;
    if (typeof isReady !== 'boolean') {
      client.emit('error', gameError(ErrorCode.WRONG_PHASE, 'isReady must be a boolean.'));
      return;
    }
    await this.withContext(client, (room, playerId) =>
      applyIntent(room.state, { type: 'SET_READY', playerId, isReady }, this.deps(room)),
    );
  }

  @SubscribeMessage('rollDice')
  async handleRollDice(@ConnectedSocket() client: Socket): Promise<void> {
    await this.withContext(client, (room, playerId) =>
      applyIntent(room.state, { type: 'ROLL_DICE', playerId }, this.deps(room)),
    );
  }

  @SubscribeMessage('placeBid')
  async handlePlaceBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const bid = (payload as { bid?: unknown } | undefined)?.bid;
    if (!isValidBid(bid)) {
      client.emit('error', gameError(ErrorCode.ILLEGAL_BID, 'Malformed bid payload.'));
      return;
    }
    await this.withContext(client, (room, playerId) =>
      applyIntent(room.state, { type: 'PLACE_BID', playerId, bid }, this.deps(room)),
    );
  }

  @SubscribeMessage('callLiar')
  async handleCallLiar(@ConnectedSocket() client: Socket): Promise<void> {
    await this.withContext(client, (room, playerId) =>
      applyIntent(room.state, { type: 'CALL_LIAR', playerId }, this.deps(room)),
    );
  }

  @SubscribeMessage('declareSpecialRound')
  async handleDeclareSpecialRound(@ConnectedSocket() client: Socket): Promise<void> {
    await this.withContext(client, (room, playerId) =>
      applyIntent(room.state, { type: 'DECLARE_SPECIAL_ROUND', playerId }, this.deps(room)),
    );
  }

  private deps(room: RoomRuntime): { diceRoller: RoomRuntime['diceRoller'] } {
    return { diceRoller: room.diceRoller };
  }

  private async withContext(
    client: Socket,
    apply: (room: RoomRuntime, playerId: string) => EngineResult,
  ): Promise<void> {
    const context = this.contexts.get(client.id);
    if (!context) {
      client.emit(
        'error',
        gameError(ErrorCode.ROOM_NOT_FOUND, 'Join a room before sending intents.'),
      );
      return;
    }
    await this.rooms.runExclusive(context.roomId, (room) => {
      const result = apply(room, context.playerId);
      if (!result.ok) {
        client.emit('error', result.error);
        return;
      }
      room.state = result.state;
      this.broadcast(context.roomId, room, result.events);
    });
  }

  private broadcast(roomId: string, room: RoomRuntime, events: readonly ServerEvent[]): void {
    if (events.length > 0) {
      this.server.to(roomId).emit('events', events);
    }
    for (const [playerId, socket] of room.sockets) {
      socket.emit('state', selectPlayerView(room.state, playerId));
    }
    this.logger.debug(`room ${roomId}: ${events.map((e) => e.type).join(', ')}`);
  }
}
