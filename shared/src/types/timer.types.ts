import type { MatchState } from './state.types';

/**
 * Server-authoritative turn-timer metadata (5.6, 5.7, 6.5) attached to the wire snapshot for
 * whichever player currently owns the BIDDING turn — never part of the engine's own `MatchState`
 * (GameEngine has no clock, 6.3/6.4), only ever computed and attached by the server's transport
 * layer just before broadcasting. Presentation-only for the client: all timestamps are server
 * epoch ms, and the quiet/warning boundaries are fixed offsets the client never needs to guess at
 * (RULES_CONFIG stays the single source of the underlying durations).
 */
export interface TurnTimerView {
  /** The player whose turn this timer belongs to. */
  readonly playerId: string;
  /** Epoch ms this player's turn began (includes any special-round bonus already applied, 5.5). */
  readonly turnStartedAt: number;
  /** Epoch ms the quiet phase ends and the audible "yellow zone" begins. */
  readonly quietPhaseEndsAt: number;
  /** Epoch ms the audible phase ends — this is also when the personal bank starts being spent. */
  readonly warningPhaseEndsAt: number;
  /**
   * Epoch ms the personal bank will be fully spent (timeout fires) if nothing else happens.
   * `null` while the bank isn't actively ticking — i.e. the active player is currently
   * disconnected, so per 5.6 the bank is not spent automatically (see rooms.service.ts /
   * turn-timer.service.ts for the disconnect-fallback mechanism that still bounds this case).
   */
  readonly bankDeadlineAt: number | null;
  /** Ms of personal bank budget left, frozen at the moment of this snapshot. */
  readonly bankMsRemaining: number;
}

/** The actual wire shape sent to a client (`state` socket event) — a filtered `MatchState`
 * (4.5, 6.6) plus the current turn's timer view, if any. Kept out of `MatchState` itself so
 * GameEngine and its tests never need to know timers exist (6.3). */
export interface StateSnapshot extends MatchState {
  readonly turnTimer: TurnTimerView | null;
}
