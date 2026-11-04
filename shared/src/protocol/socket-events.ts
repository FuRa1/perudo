import type { Bid } from '@shared/types/bid.types';
import type { GameError } from '@shared/types/error.types';

/**
 * Socket.io event names — the only strings client and server use to talk (CLAUDE.md 3.2).
 * Client → server events are acknowledged with an {@link ActionResult}; the server pushes
 * state only through {@link SERVER_EVENTS.STATE}.
 */
export const CLIENT_EVENTS = {
  CREATE_ROOM: 'room:create',
  JOIN_ROOM: 'room:join',
  SET_READY: 'game:setReady',
  ROLL_DICE: 'game:rollDice',
  PLACE_BID: 'game:placeBid',
  CALL_LIAR: 'game:callLiar',
  DECLARE_SPECIAL_ROUND: 'game:declareSpecialRound',
} as const;

export const SERVER_EVENTS = {
  /** A full, per-player filtered {@link PlayerView} snapshot (6.6). */
  STATE: 'game:state',
} as const;

export interface CreateRoomPayload {
  readonly nickname: string;
}

export interface JoinRoomPayload {
  readonly roomId: string;
  readonly nickname: string;
}

export interface SetReadyPayload {
  readonly isReady: boolean;
}

export interface PlaceBidPayload {
  readonly bid: Bid;
}

/** Returned to the creator/joiner. The player id is assigned by the server, never by the client. */
export interface JoinedRoom {
  readonly roomId: string;
  readonly playerId: string;
}

/**
 * The structured response to every client intent (4.2): success, or an error code + message
 * with the room state left untouched. Delivered as the Socket.io acknowledgement.
 */
export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: GameError };
