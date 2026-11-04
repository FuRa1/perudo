import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import {
  CLIENT_EVENTS,
  ErrorCode,
  SERVER_EVENTS,
  gameError,
  type ActionResult,
  type Intent,
  type JoinedRoom,
} from '@shared';
import type { Server, Socket } from 'socket.io';
import { parseBid, parseIsReady, parseNickname, parseRoomCode } from './payload-guards';
import { RoomsService } from './rooms.service';

/** Which seat a connection controls. Set by the server on create/join — never by the client. */
interface SeatBinding {
  roomId: string;
  playerId: string;
}

type SeatIntent = Intent extends infer I ? (I extends Intent ? Omit<I, 'playerId'> : never) : never;

function invalidPayload(message: string): ActionResult<never> {
  return { ok: false, error: gameError(ErrorCode.INVALID_PAYLOAD, message) };
}

function seatChannel(roomId: string, playerId: string): string {
  return `seat:${roomId}:${playerId}`;
}

/**
 * Thin transport layer (CLAUDE.md 3.2, 6.3): parses untrusted payloads, binds a socket to a seat,
 * forwards intents to {@link RoomsService}, and pushes each seat its own filtered snapshot.
 * CORS reflects any origin because clients are browsers on other hosts/ports and native
 * Capacitor apps; access is by room code, not by origin.
 */
@WebSocketGateway({ cors: { origin: true } })
export class GameGateway implements OnModuleInit, OnModuleDestroy, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly rooms: RoomsService) {}

  onModuleInit(): void {
    this.unsubscribe = this.rooms.onRoomChanged((roomId) => this.broadcastRoom(roomId));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const seat = this.seatOf(socket);
    if (seat) {
      await this.rooms.disconnect(seat.roomId, seat.playerId);
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.CREATE_ROOM)
  async handleCreateRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<ActionResult<JoinedRoom>> {
    const nickname = parseNickname(body);
    if (nickname === null) {
      return invalidPayload('A nickname is required.');
    }
    return this.bindSeat(socket, () => this.rooms.createRoom(nickname));
  }

  @SubscribeMessage(CLIENT_EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<ActionResult<JoinedRoom>> {
    const nickname = parseNickname(body);
    const roomId = parseRoomCode(body);
    if (nickname === null || roomId === null) {
      return invalidPayload('A nickname and a valid room code are required.');
    }
    return this.bindSeat(socket, () => this.rooms.joinRoom(roomId, nickname));
  }

  @SubscribeMessage(CLIENT_EVENTS.SET_READY)
  handleSetReady(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<ActionResult> {
    const isReady = parseIsReady(body);
    if (isReady === null) {
      return Promise.resolve(invalidPayload('isReady must be a boolean.'));
    }
    return this.submit(socket, { type: 'SET_READY', isReady });
  }

  @SubscribeMessage(CLIENT_EVENTS.ROLL_DICE)
  handleRollDice(@ConnectedSocket() socket: Socket): Promise<ActionResult> {
    return this.submit(socket, { type: 'ROLL_DICE' });
  }

  @SubscribeMessage(CLIENT_EVENTS.PLACE_BID)
  handlePlaceBid(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<ActionResult> {
    const bid = parseBid(body);
    if (bid === null) {
      return Promise.resolve(invalidPayload('The bid is malformed.'));
    }
    return this.submit(socket, { type: 'PLACE_BID', bid });
  }

  @SubscribeMessage(CLIENT_EVENTS.CALL_LIAR)
  handleCallLiar(@ConnectedSocket() socket: Socket): Promise<ActionResult> {
    return this.submit(socket, { type: 'CALL_LIAR' });
  }

  @SubscribeMessage(CLIENT_EVENTS.DECLARE_SPECIAL_ROUND)
  handleDeclareSpecialRound(@ConnectedSocket() socket: Socket): Promise<ActionResult> {
    return this.submit(socket, { type: 'DECLARE_SPECIAL_ROUND' });
  }

  /** The player id always comes from the socket's seat, so a client can't act for someone else. */
  private submit(socket: Socket, seatIntent: SeatIntent): Promise<ActionResult> {
    const seat = this.seatOf(socket);
    if (!seat) {
      return Promise.resolve({
        ok: false,
        error: gameError(ErrorCode.NOT_IN_ROOM, 'Join a room first.'),
      });
    }
    const intent = { ...seatIntent, playerId: seat.playerId } as Intent;
    return this.rooms.submitIntent(seat.roomId, intent);
  }

  private async bindSeat(
    socket: Socket,
    join: () => Promise<ActionResult<JoinedRoom>>,
  ): Promise<ActionResult<JoinedRoom>> {
    if (this.seatOf(socket)) {
      return {
        ok: false,
        error: gameError(ErrorCode.PLAYER_ALREADY_JOINED, 'This connection is already seated.'),
      };
    }
    const result = await join();
    if (result.ok) {
      const seat: SeatBinding = result.data;
      (socket.data as { seat?: SeatBinding }).seat = seat;
      await socket.join(seatChannel(seat.roomId, seat.playerId));
      this.broadcastRoom(seat.roomId);
    }
    return result;
  }

  private broadcastRoom(roomId: string): void {
    for (const { playerId, view } of this.rooms.viewsFor(roomId)) {
      this.server.to(seatChannel(roomId, playerId)).emit(SERVER_EVENTS.STATE, view);
    }
  }

  private seatOf(socket: Socket): SeatBinding | null {
    return (socket.data as { seat?: SeatBinding }).seat ?? null;
  }
}
