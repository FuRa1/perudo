import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CLIENT_EVENTS,
  ErrorCode,
  GamePhase,
  buildBidScaleContext,
  type ActionResult,
  type Bid,
  type BidScaleContext,
  type GameError,
  type JoinedRoom,
  type PlayerView,
  type PublicPlayerView,
} from '@shared';
import { GameSocketService, type ClientEvent } from './game-socket.service';

const CONNECTION_LOST: GameError = {
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Connection to the server was lost. Rejoining a match arrives in a later update.',
};

/**
 * The client's single source of state (CLAUDE.md 3.2). It only ever holds what the server last
 * sent — the UI is pessimistic (6.6): an action changes nothing locally, the next snapshot does.
 */
@Injectable({ providedIn: 'root' })
export class GameStore {
  private readonly socket = inject(GameSocketService);

  readonly view = signal<PlayerView | null>(null);
  readonly error = signal<GameError | null>(null);
  readonly isBusy = signal(false);
  readonly connection = this.socket.status;

  readonly phase = computed(() => this.view()?.phase ?? null);
  readonly selfId = computed(() => this.view()?.selfId ?? null);
  readonly players = computed(() => this.view()?.players ?? []);
  readonly me = computed(() => this.players().find((p) => p.id === this.selfId()) ?? null);
  readonly round = computed(() => this.view()?.round ?? null);
  readonly lastBid = computed(() => this.round()?.bidHistory.at(-1) ?? null);
  readonly isMyTurn = computed(
    () => this.phase() === GamePhase.BIDDING && this.round()?.currentPlayerId === this.selfId(),
  );
  readonly totalDice = computed(() => this.players().reduce((sum, p) => sum + p.diceCount, 0));

  /** The validator context for client pre-validation — derived exactly as the engine does. */
  readonly bidContext = computed<BidScaleContext | null>(() => {
    const round = this.round();
    return round ? buildBidScaleContext(round.bidHistory, round.isSpecialRoundDeclared) : null;
  });

  readonly canDeclareSpecialRound = computed(() => {
    const round = this.round();
    return (
      this.phase() === GamePhase.BIDDING &&
      !!round &&
      round.bidHistory.length === 0 &&
      !round.isSpecialRoundDeclared &&
      this.me()?.diceCount === 1
    );
  });

  constructor() {
    this.socket.onState((view) => this.view.set(view));
    this.socket.onDisconnect(() => {
      this.view.set(null);
      this.error.set(CONNECTION_LOST);
    });
  }

  player(id: string | null | undefined): PublicPlayerView | null {
    return this.players().find((p) => p.id === id) ?? null;
  }

  nickname(id: string | null | undefined): string {
    return this.player(id)?.nickname ?? '?';
  }

  createRoom(nickname: string): Promise<JoinedRoom | null> {
    return this.join(CLIENT_EVENTS.CREATE_ROOM, { nickname });
  }

  joinRoom(roomId: string, nickname: string): Promise<JoinedRoom | null> {
    return this.join(CLIENT_EVENTS.JOIN_ROOM, { roomId, nickname });
  }

  setReady(isReady: boolean): Promise<boolean> {
    return this.run(CLIENT_EVENTS.SET_READY, { isReady });
  }

  rollDice(): Promise<boolean> {
    return this.run(CLIENT_EVENTS.ROLL_DICE);
  }

  placeBid(bid: Bid): Promise<boolean> {
    return this.run(CLIENT_EVENTS.PLACE_BID, { bid });
  }

  callLiar(): Promise<boolean> {
    return this.run(CLIENT_EVENTS.CALL_LIAR);
  }

  declareSpecialRound(): Promise<boolean> {
    return this.run(CLIENT_EVENTS.DECLARE_SPECIAL_ROUND);
  }

  leave(): void {
    this.socket.disconnect();
    this.view.set(null);
  }

  clearError(): void {
    this.error.set(null);
  }

  private async join(event: ClientEvent, payload: object): Promise<JoinedRoom | null> {
    const result = await this.dispatch<JoinedRoom>(event, payload);
    return result.ok ? result.data : null;
  }

  private async run(event: ClientEvent, payload: object = {}): Promise<boolean> {
    return (await this.dispatch(event, payload)).ok;
  }

  private async dispatch<T>(event: ClientEvent, payload: object): Promise<ActionResult<T>> {
    this.isBusy.set(true);
    this.error.set(null);
    try {
      const result = await this.socket.send<T>(event, payload);
      if (!result.ok) {
        this.error.set(result.error);
      }
      return result;
    } finally {
      this.isBusy.set(false);
    }
  }
}
