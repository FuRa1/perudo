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
  applyTimeout,
  ErrorCode,
  gameError,
  GamePhase,
  selectPlayerView,
  type Bid,
  type EngineResult,
  type ServerEvent,
} from '@shared';
import { createReconnectToken, RoomsService, type RoomRuntime } from './rooms.service';
import { TurnTimerService } from './turn-timer.service';
import { TimerConfigService } from './timer-config.service';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface JoinRoomPayload {
  roomId: string;
  nickname: string;
}

interface ReconnectPayload {
  roomId: string;
  token: string;
}

interface PersistedTimerConfigFile {
  turnTimer: {
    quietPhaseEndMs: number;
    audiblePhaseEndMs: number;
    baseTurnMs: number;
    personalBankMs: number;
  };
  specialRoundBonusTimerMs: number;
  reconnectWaitWindowMs: number;
  enabled: boolean;
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

/** Runtime type guard for an incoming `placeBid` payload's `bid` field (4.2/5.8): `isLegalBid`
 * assumes a well-typed `Bid` and only checks the rules scale, so a structurally wrong payload
 * (wrong field types, unknown `kind`) must be rejected here, before it ever reaches `applyIntent`. */
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

/** Which broadcast `events` types indicate a BIDDING turn just started, was reset, or was
 * extended (Phase 5) — used to keep the room's server-authoritative turn timer in lockstep with
 * the engine's own state transitions, without GameEngine itself needing to know timers exist. */
function findEvent<T extends ServerEvent['type']>(
  events: readonly ServerEvent[],
  type: T,
): Extract<ServerEvent, { type: T }> | undefined {
  return events.find((e): e is Extract<ServerEvent, { type: T }> => e.type === type);
}

/** Thin transport layer over GameEngine (3.2, 6.3) — this class holds no game rules of its own,
 * it only translates socket messages into Intents and broadcasts the results. Turn-timer
 * scheduling (5.6/5.7/6.5) and reconnect sessions (section 7) are transport/session concerns
 * that live here too, alongside the socket wiring itself — GameEngine stays unaware of both. */
@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  private readonly contexts = new Map<string, SocketContext>();

  constructor(
    private readonly rooms: RoomsService,
    private readonly timers: TurnTimerService,
    private readonly timerConfigService: TimerConfigService,
  ) {
    this.timers.setTimeoutHandler((room, playerId) => this.handleTurnTimerFired(room, playerId));
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const context = this.contexts.get(client.id);
    this.contexts.delete(client.id);
    if (!context) {
      return;
    }
    const { roomId, playerId } = context;
    await this.rooms.runExclusive(roomId, (room) => {
      if (room.sockets.get(playerId) !== client) {
        // A newer socket for this player already replaced this one (fast reconnect) — leave it.
        return;
      }
      room.sockets.delete(playerId);
      this.timers.onPlayerDisconnected(room, playerId);
      this.broadcast(roomId, room, [{ type: 'PLAYER_DISCONNECTED', playerId }]);
    });
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
      const reconnectToken = createReconnectToken();
      room.sessionsByToken.set(reconnectToken, playerId);
      this.contexts.set(client.id, { roomId, playerId });
      void client.join(roomId);
      client.emit('joined', { playerId, roomId, reconnectToken });
      this.syncTimer(room, result.events);
      this.broadcast(roomId, room, result.events);
    });
  }

  /** Restores a disconnected (or simply re-loaded) player to their existing slot by reconnect
   * token (section 7) — never creates a room for an unknown roomId (unlike joinRoom, where that
   * side effect is the point); an invalid/unknown token or room is always INVALID_TOKEN (4.2). */
  @SubscribeMessage('reconnectToRoom')
  async handleReconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const body = payload as Partial<ReconnectPayload> | undefined;
    if (!isNonEmptyString(body?.roomId) || !isNonEmptyString(body?.token)) {
      client.emit('error', gameError(ErrorCode.INVALID_TOKEN, 'roomId and token are required.'));
      return;
    }
    const { roomId, token } = body;
    if (!this.rooms.find(roomId)) {
      client.emit('error', gameError(ErrorCode.INVALID_TOKEN, 'Unknown room.'));
      return;
    }

    await this.rooms.runExclusive(roomId, (room) => {
      const playerId = room.sessionsByToken.get(token);
      const player = playerId ? room.state.players.find((p) => p.id === playerId) : undefined;
      if (!playerId || !player) {
        client.emit(
          'error',
          gameError(ErrorCode.INVALID_TOKEN, 'Reconnect token is invalid or expired.'),
        );
        return;
      }

      const previousSocket = room.sockets.get(playerId);
      if (previousSocket && previousSocket.id !== client.id) {
        this.contexts.delete(previousSocket.id);
      }
      room.sockets.set(playerId, client);
      this.contexts.set(client.id, { roomId, playerId });
      void client.join(roomId);
      client.emit('joined', { playerId, roomId, reconnectToken: token });
      this.timers.onPlayerReconnected(room, playerId);
      this.broadcast(roomId, room, [{ type: 'PLAYER_RECONNECTED', playerId }]);
    });
  }

  @SubscribeMessage('setTimerMode')
  handleSetTimerMode(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown): void {
    const isTimersEnabled = (payload as { enabled?: unknown } | undefined)?.enabled;
    if (typeof isTimersEnabled !== 'boolean') {
      client.emit('error', gameError(ErrorCode.WRONG_PHASE, 'enabled must be a boolean.'));
      return;
    }

    const context = this.contexts.get(client.id);
    if (!context) {
      client.emit(
        'error',
        gameError(ErrorCode.ROOM_NOT_FOUND, 'Join a room before sending intents.'),
      );
      return;
    }

    // For this MVP version, we'll just update the config directly for demonstration
    // In a real implementation, this would be saved to room state or configuration storage
    try {
      const configFile = join(process.cwd(), 'perudo.config.json');
      let existingConfig: PersistedTimerConfigFile = {
        turnTimer: {
          quietPhaseEndMs: 15000,
          audiblePhaseEndMs: 25000,
          baseTurnMs: 25000,
          personalBankMs: 30000,
        },
        specialRoundBonusTimerMs: 7000,
        reconnectWaitWindowMs: 60000,
        enabled: true,
      };

      if (existsSync(configFile)) {
        const configContent = readFileSync(configFile, 'utf8');
        existingConfig = JSON.parse(configContent) as PersistedTimerConfigFile;
      }

      existingConfig.enabled = isTimersEnabled;

      writeFileSync(configFile, JSON.stringify(existingConfig, null, 2));

      client.emit('timerModeChanged', { enabled: isTimersEnabled });
    } catch (error) {
      this.logger.error('Failed to update timer mode', error);
      client.emit('error', gameError(ErrorCode.WRONG_PHASE, 'Failed to update timer mode.'));
    }
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
    const bidPayload = (payload as { bid?: unknown } | undefined)?.bid;
    await this.withContext(client, (room, playerId) => {
      if (!isValidBid(bidPayload)) {
        return {
          ok: false,
          error: gameError(ErrorCode.ILLEGAL_BID, 'Malformed bid payload.'),
        };
      }
      return applyIntent(
        room.state,
        { type: 'PLACE_BID', playerId, bid: bidPayload },
        this.deps(room),
      );
    });
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
      this.syncTimer(room, result.events);
      this.broadcast(context.roomId, room, result.events);
    });
  }

  /** The server-timer counterpart to a client intent: called by TurnTimerService, already inside
   * the room's serialized mutation queue and already generation-checked (3.3, Phase 5). Applies
   * exactly like any other timeout would — `applyTimeout` re-validates phase/turn ownership on
   * its own, so a stale firing that lost the race to a just-accepted bid simply fails quietly. */
  private handleTurnTimerFired(room: RoomRuntime, playerId: string): void {
    const result = applyTimeout(room.state, playerId);
    if (!result.ok) {
      this.logger.debug(`Ignored a timeout for ${playerId}: ${result.error.code}`);
      return;
    }
    room.state = result.state;
    this.syncTimer(room, result.events);
    this.broadcast(room.state.roomId, room, result.events);
  }

  /** Keeps the room's turn timer in lockstep with whatever the engine just did, purely by reading
   * the events it emitted — never by diffing phases, so this stays correct regardless of how
   * many other fields change around it. */
  private syncTimer(room: RoomRuntime, events: readonly ServerEvent[]): void {
    if (findEvent(events, 'MATCH_WON') || findEvent(events, 'ROUND_STARTED')) {
      // A round ending (win or a new round beginning) always invalidates the previous BIDDING
      // timer; a new one (if any) only starts once every hand has been rolled, below.
      this.timers.cancelTimer(room);
      return;
    }
    const rolledHand = findEvent(events, 'PLAYER_ROLLED_HAND');
    if (rolledHand && room.state.phase === GamePhase.BIDDING) {
      this.startTimerForCurrentTurn(room);
      return;
    }
    if (findEvent(events, 'BID_PLACED')) {
      this.startTimerForCurrentTurn(room);
      return;
    }
    const timedOut = findEvent(events, 'TURN_TIMED_OUT');
    if (timedOut && !timedOut.dieLost) {
      // Double-loss protection: the round continues, the turn just passes (5.7).
      this.startTimerForCurrentTurn(room);
      return;
    }
    if (findEvent(events, 'SPECIAL_ROUND_DECLARED')) {
      this.timers.extendForSpecialRound(room);
    }
  }

  private startTimerForCurrentTurn(room: RoomRuntime): void {
    // Check if timers are disabled before starting timer
    if (!this.timerConfigService.isTimerEnabled()) {
      return;
    }

    const round = room.state.round;
    const playerId = round?.turnOrder[round.currentTurnIndex];
    if (playerId) {
      this.timers.startTimer(room, playerId);
    }
  }

  private broadcast(roomId: string, room: RoomRuntime, events: readonly ServerEvent[]): void {
    if (events.length > 0) {
      this.server.to(roomId).emit('events', events);
    }
    const turnTimer = this.timers.buildView(room);
    for (const [playerId, socket] of room.sockets) {
      socket.emit('state', selectPlayerView(room.state, playerId, turnTimer));
    }
    this.logger.debug(`room ${roomId}: ${events.map((e) => e.type).join(', ')}`);
  }
}
