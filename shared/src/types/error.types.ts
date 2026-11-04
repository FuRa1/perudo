/** Single error contract shared by client and server (CLAUDE.md 4.2). */
export enum ErrorCode {
  NOT_YOUR_TURN = 'NOT_YOUR_TURN',
  ILLEGAL_BID = 'ILLEGAL_BID',
  WRONG_PHASE = 'WRONG_PHASE',
  ROOM_FULL = 'ROOM_FULL',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',
  ALREADY_ROLLED = 'ALREADY_ROLLED',
  SPECIAL_ROUND_UNAVAILABLE = 'SPECIAL_ROUND_UNAVAILABLE',
  NOT_ENOUGH_PLAYERS = 'NOT_ENOUGH_PLAYERS',
  PLAYER_ALREADY_JOINED = 'PLAYER_ALREADY_JOINED',
  NO_BID_TO_CHALLENGE = 'NO_BID_TO_CHALLENGE',
  /** The transport payload failed shape validation — the client is never trusted (4.2). */
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  /** A game intent arrived on a connection that hasn't joined a room. */
  NOT_IN_ROOM = 'NOT_IN_ROOM',
  /** Anything unexpected; the server logs it and the room state is left untouched. */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface GameError {
  readonly code: ErrorCode;
  readonly message: string;
}

export function gameError(code: ErrorCode, message: string): GameError {
  return { code, message };
}
