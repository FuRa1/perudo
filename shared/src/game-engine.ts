import { isLegalBid } from '@shared/logic/bid-scale';
import { countClaimedFace } from '@shared/logic/dice-count';
import { isIntentAllowedInPhase } from '@shared/logic/phase-intents';
import { determineLiarOutcome } from '@shared/logic/round-outcome';
import { RULES_CONFIG } from './rules.config';
import type { NormalBid } from '@shared/types/bid.types';
import type { DiceRoller, DiceValue } from '@shared/types/dice.types';
import { ErrorCode, gameError, type GameError } from '@shared/types/error.types';
import type { ServerEvent } from '@shared/types/event.types';
import type { Intent } from '@shared/types/intent.types';
import type { BidRecord, MatchState, Player, RoundState } from '@shared/types/state.types';
import { GamePhase } from '@shared/types/state.types';

export interface EngineDeps {
  readonly diceRoller: DiceRoller;
}

export type EngineResult =
  | { readonly ok: true; readonly state: MatchState; readonly events: readonly ServerEvent[] }
  | { readonly ok: false; readonly error: GameError };

function ok(state: MatchState, events: ServerEvent[]): EngineResult {
  return { ok: true, state, events };
}

function fail(code: ErrorCode, message: string): EngineResult {
  return { ok: false, error: gameError(code, message) };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled intent type: ${JSON.stringify(value)}`);
}

function findPlayer(state: MatchState, playerId: string): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

function updatePlayer(
  players: readonly Player[],
  playerId: string,
  update: (player: Player) => Player,
): Player[] {
  return players.map((player) => (player.id === playerId ? update(player) : player));
}

export function createInitialMatchState(roomId: string): MatchState {
  return {
    phase: GamePhase.LOBBY,
    roomId,
    players: [],
    startRoll: null,
    completedStartRoll: null,
    round: null,
    winnerId: null,
  };
}

// ---------------------------------------------------------------------------
// LOBBY
// ---------------------------------------------------------------------------

function applyJoinRoom(
  state: MatchState,
  intent: Extract<Intent, { type: 'JOIN_ROOM' }>,
): EngineResult {
  if (findPlayer(state, intent.playerId)) {
    return fail(
      ErrorCode.PLAYER_ALREADY_JOINED,
      `Player ${intent.playerId} already joined this room.`,
    );
  }
  if (state.players.length >= RULES_CONFIG.players.max) {
    return fail(
      ErrorCode.ROOM_FULL,
      `Room already has the maximum of ${RULES_CONFIG.players.max} players.`,
    );
  }
  const newPlayer: Player = {
    id: intent.playerId,
    nickname: intent.nickname,
    isReady: false,
    diceCount: RULES_CONFIG.startingDicePerPlayer,
    dice: [],
    consecutivePureStalls: 0,
  };
  const newState: MatchState = { ...state, players: [...state.players, newPlayer] };
  return ok(newState, [
    { type: 'PLAYER_JOINED', playerId: intent.playerId, nickname: intent.nickname },
  ]);
}

function applySetReady(
  state: MatchState,
  intent: Extract<Intent, { type: 'SET_READY' }>,
): EngineResult {
  const player = findPlayer(state, intent.playerId);
  if (!player) {
    return fail(ErrorCode.PLAYER_NOT_FOUND, `Player ${intent.playerId} is not in this room.`);
  }
  const players = updatePlayer(state.players, intent.playerId, (p) => ({
    ...p,
    isReady: intent.isReady,
  }));
  const events: ServerEvent[] = [
    { type: 'PLAYER_READY_CHANGED', playerId: intent.playerId, isReady: intent.isReady },
  ];

  const everyoneReady =
    players.length >= RULES_CONFIG.players.min && players.every((p) => p.isReady);
  if (!everyoneReady) {
    return ok({ ...state, players }, events);
  }

  events.push({ type: 'MATCH_STARTED' });
  const newState: MatchState = {
    ...state,
    players,
    phase: GamePhase.START_ROLL,
    startRoll: { pendingPlayerIds: players.map((p) => p.id), rolls: {} },
  };
  return ok(newState, events);
}

// ---------------------------------------------------------------------------
// START_ROLL (5.2) and ROUND_ROLLING (5.3) — both driven by the ROLL_DICE intent.
// ---------------------------------------------------------------------------

function buildTurnOrder(players: readonly Player[], firstPlayerId: string): string[] {
  const activeIds = players.filter((p) => p.diceCount > 0).map((p) => p.id);
  const startIndex = Math.max(activeIds.indexOf(firstPlayerId), 0);
  return [...activeIds.slice(startIndex), ...activeIds.slice(0, startIndex)];
}

function createRoundState(
  players: readonly Player[],
  firstPlayerId: string,
  roundNumber: number,
): RoundState {
  const turnOrder = buildTurnOrder(players, firstPlayerId);
  return {
    roundNumber,
    turnOrder,
    currentTurnIndex: 0,
    bidHistory: [],
    isSpecialRoundDeclared: false,
    pendingRolls: [...turnOrder],
  };
}

function applyStartRollRoll(
  state: MatchState,
  intent: Extract<Intent, { type: 'ROLL_DICE' }>,
  deps: EngineDeps,
): EngineResult {
  const startRoll = state.startRoll;
  if (!startRoll || !startRoll.pendingPlayerIds.includes(intent.playerId)) {
    return fail(
      ErrorCode.ALREADY_ROLLED,
      `Player ${intent.playerId} already rolled for the starting round.`,
    );
  }

  const value = deps.diceRoller.roll();
  const rolls = { ...startRoll.rolls, [intent.playerId]: value };
  const pendingPlayerIds = startRoll.pendingPlayerIds.filter((id) => id !== intent.playerId);
  const events: ServerEvent[] = [{ type: 'START_ROLL_ROLLED', playerId: intent.playerId, value }];

  if (pendingPlayerIds.length > 0) {
    return ok({ ...state, startRoll: { pendingPlayerIds, rolls } }, events);
  }

  const entries = Object.entries(rolls);
  const maxValue = Math.max(...entries.map(([, v]) => v));
  const winners = entries.filter(([, v]) => v === maxValue).map(([id]) => id);

  if (winners.length > 1) {
    events.push({ type: 'START_ROLL_TIED', tiedPlayerIds: winners });
    return ok({ ...state, startRoll: { pendingPlayerIds: winners, rolls: {} } }, events);
  }

  const firstPlayerId = winners[0] as string;
  const round = createRoundState(state.players, firstPlayerId, 1);
  events.push({ type: 'ROUND_STARTED', roundNumber: 1, firstPlayerId });
  // `rolls` here is exactly the decisive sub-round's map — a tie already reset it above, so
  // discarded pre-tie values never make it into the completed (public, debug-visible) result.
  const newState: MatchState = {
    ...state,
    phase: GamePhase.ROUND_ROLLING,
    startRoll: null,
    completedStartRoll: { rolls, firstPlayerId },
    round,
  };
  return ok(newState, events);
}

function applyHandRoll(
  state: MatchState,
  intent: Extract<Intent, { type: 'ROLL_DICE' }>,
  deps: EngineDeps,
): EngineResult {
  const round = state.round;
  if (!round || !round.pendingRolls.includes(intent.playerId)) {
    return fail(ErrorCode.ALREADY_ROLLED, `Player ${intent.playerId} already rolled this round.`);
  }
  const player = findPlayer(state, intent.playerId);
  if (!player) {
    return fail(ErrorCode.PLAYER_NOT_FOUND, `Player ${intent.playerId} is not in this room.`);
  }

  const dice = Array.from({ length: player.diceCount }, () => deps.diceRoller.roll());
  const players = updatePlayer(state.players, intent.playerId, (p) => ({ ...p, dice }));
  const pendingRolls = round.pendingRolls.filter((id) => id !== intent.playerId);
  const events: ServerEvent[] = [{ type: 'PLAYER_ROLLED_HAND', playerId: intent.playerId }];

  if (pendingRolls.length > 0) {
    return ok({ ...state, players, round: { ...round, pendingRolls } }, events);
  }

  const newState: MatchState = {
    ...state,
    players,
    phase: GamePhase.BIDDING,
    // The temporary opening-roll debug view (CompletedStartRoll) is retained through round 1's
    // hand-rolling and cleared exactly here, on reaching BIDDING. For round 2+ this is already
    // null (cleared during round 1), so the assignment is a harmless no-op there.
    completedStartRoll: null,
    round: { ...round, pendingRolls },
  };
  return ok(newState, events);
}

function applyRollDice(
  state: MatchState,
  intent: Extract<Intent, { type: 'ROLL_DICE' }>,
  deps: EngineDeps,
): EngineResult {
  return state.phase === GamePhase.START_ROLL
    ? applyStartRollRoll(state, intent, deps)
    : applyHandRoll(state, intent, deps);
}

// ---------------------------------------------------------------------------
// BIDDING (5.3, 5.4, 5.5)
// ---------------------------------------------------------------------------

function lastNormalBidOf(bidHistory: readonly BidRecord[]): NormalBid | null {
  for (let i = bidHistory.length - 1; i >= 0; i -= 1) {
    const record = bidHistory[i] as BidRecord;
    if (record.bid.kind === 'NORMAL') {
      return record.bid;
    }
  }
  return null;
}

function applyPlaceBid(
  state: MatchState,
  intent: Extract<Intent, { type: 'PLACE_BID' }>,
): EngineResult {
  const round = state.round as RoundState;
  const currentPlayerId = round.turnOrder[round.currentTurnIndex];
  if (intent.playerId !== currentPlayerId) {
    return fail(ErrorCode.NOT_YOUR_TURN, `It is not ${intent.playerId}'s turn to bid.`);
  }

  const lastRecord = round.bidHistory[round.bidHistory.length - 1];
  const legal = isLegalBid(intent.bid, {
    lastBid: lastRecord?.bid ?? null,
    lastNormalBid: lastNormalBidOf(round.bidHistory),
    isSpecialRound: round.isSpecialRoundDeclared,
  });
  if (!legal) {
    return fail(ErrorCode.ILLEGAL_BID, `${JSON.stringify(intent.bid)} is not a legal raise.`);
  }

  const players = updatePlayer(state.players, intent.playerId, (p) => ({
    ...p,
    consecutivePureStalls: 0,
  }));
  const bidHistory = [...round.bidHistory, { playerId: intent.playerId, bid: intent.bid }];
  const currentTurnIndex = (round.currentTurnIndex + 1) % round.turnOrder.length;
  const newState: MatchState = {
    ...state,
    players,
    round: { ...round, bidHistory, currentTurnIndex },
  };
  return ok(newState, [{ type: 'BID_PLACED', playerId: intent.playerId, bid: intent.bid }]);
}

function applyDeclareSpecialRound(
  state: MatchState,
  intent: Extract<Intent, { type: 'DECLARE_SPECIAL_ROUND' }>,
): EngineResult {
  const round = state.round as RoundState;
  if (round.bidHistory.length > 0) {
    return fail(
      ErrorCode.SPECIAL_ROUND_UNAVAILABLE,
      'The first bid of the round has already been placed.',
    );
  }
  if (round.isSpecialRoundDeclared) {
    return fail(
      ErrorCode.SPECIAL_ROUND_UNAVAILABLE,
      'A special round has already been declared this round.',
    );
  }
  const player = findPlayer(state, intent.playerId);
  if (!player) {
    return fail(ErrorCode.PLAYER_NOT_FOUND, `Player ${intent.playerId} is not in this room.`);
  }
  if (player.diceCount !== 1) {
    return fail(
      ErrorCode.SPECIAL_ROUND_UNAVAILABLE,
      'Only a player with exactly one die may declare a special round.',
    );
  }

  // The 7-second bonus timer for the round's first player (5.5) is server-timer wiring — Phase 5.
  const newState: MatchState = { ...state, round: { ...round, isSpecialRoundDeclared: true } };
  return ok(newState, [{ type: 'SPECIAL_ROUND_DECLARED', playerId: intent.playerId }]);
}

// ---------------------------------------------------------------------------
// Shared round-ending machinery — used by both CALL_LIAR and turn timeout.
// ---------------------------------------------------------------------------

function determineNextFirstPlayer(
  seatingOrder: readonly Player[],
  loserId: string,
  updatedPlayers: readonly Player[],
): string {
  const loser = updatedPlayers.find((p) => p.id === loserId) as Player;
  if (loser.diceCount > 0) {
    return loserId;
  }
  const ids = seatingOrder.map((p) => p.id);
  const loserIndex = ids.indexOf(loserId);
  for (let step = 1; step <= ids.length; step += 1) {
    const candidateId = ids[(loserIndex + step) % ids.length] as string;
    const candidate = updatedPlayers.find((p) => p.id === candidateId) as Player;
    if (candidate.diceCount > 0) {
      return candidateId;
    }
  }
  throw new Error(
    'No active players remain — this should be unreachable once the match-win check has run.',
  );
}

function finishRoundAfterLoss(
  state: MatchState,
  updatedPlayers: readonly Player[],
  loserId: string,
  precedingEvents: ServerEvent[],
): EngineResult {
  const events = [...precedingEvents];
  const loser = updatedPlayers.find((p) => p.id === loserId) as Player;
  if (loser.diceCount === 0) {
    events.push({ type: 'PLAYER_ELIMINATED', playerId: loserId });
  }

  const survivors = updatedPlayers.filter((p) => p.diceCount > 0);
  if (survivors.length <= 1) {
    const winnerId = survivors[0]?.id ?? loserId;
    events.push({ type: 'MATCH_WON', winnerId });
    const finalState: MatchState = {
      ...state,
      players: updatedPlayers,
      phase: GamePhase.GAME_OVER,
      round: null,
      winnerId,
    };
    return ok(finalState, events);
  }

  const nextFirstPlayerId = determineNextFirstPlayer(state.players, loserId, updatedPlayers);
  const nextRoundNumber = (state.round?.roundNumber ?? 0) + 1;
  const clearedPlayers = updatedPlayers.map((p) => (p.diceCount > 0 ? { ...p, dice: [] } : p));
  const round = createRoundState(clearedPlayers, nextFirstPlayerId, nextRoundNumber);
  events.push({
    type: 'ROUND_STARTED',
    roundNumber: nextRoundNumber,
    firstPlayerId: nextFirstPlayerId,
  });
  const newState: MatchState = {
    ...state,
    players: clearedPlayers,
    phase: GamePhase.ROUND_ROLLING,
    round,
  };
  return ok(newState, events);
}

function applyCallLiar(
  state: MatchState,
  intent: Extract<Intent, { type: 'CALL_LIAR' }>,
): EngineResult {
  const round = state.round as RoundState;
  const currentPlayerId = round.turnOrder[round.currentTurnIndex];
  if (intent.playerId !== currentPlayerId) {
    return fail(ErrorCode.NOT_YOUR_TURN, `It is not ${intent.playerId}'s turn to call liar.`);
  }
  const lastRecord = round.bidHistory[round.bidHistory.length - 1];
  if (!lastRecord) {
    return fail(
      ErrorCode.NO_BID_TO_CHALLENGE,
      'Liar cannot be called before any bid has been placed.',
    );
  }

  const players = updatePlayer(state.players, intent.playerId, (p) => ({
    ...p,
    consecutivePureStalls: 0,
  }));
  const dice: Record<string, readonly DiceValue[]> = {};
  for (const playerId of round.turnOrder) {
    dice[playerId] = (players.find((p) => p.id === playerId) as Player).dice;
  }
  const allDice = round.turnOrder.flatMap((playerId) => dice[playerId] as readonly DiceValue[]);
  const actualQuantity = countClaimedFace(allDice, lastRecord.bid, round.isSpecialRoundDeclared);
  const outcome = determineLiarOutcome(actualQuantity, lastRecord.bid.quantity);
  const loserId = outcome === 'CALLER_LOSES' ? intent.playerId : lastRecord.playerId;

  const updatedPlayers = updatePlayer(players, loserId, (p) => ({
    ...p,
    diceCount: p.diceCount - 1,
  }));
  const events: ServerEvent[] = [
    { type: 'LIAR_CALLED', callerId: intent.playerId },
    {
      type: 'ROUND_REVEALED',
      dice,
      claimedBid: lastRecord.bid,
      bidderId: lastRecord.playerId,
      actualQuantity,
      outcome,
      loserId,
    },
    {
      type: 'PLAYER_LOST_DIE',
      playerId: loserId,
      reason: 'LIAR_OUTCOME',
      remainingDice: (updatedPlayers.find((p) => p.id === loserId) as Player).diceCount,
    },
  ];

  return finishRoundAfterLoss(state, updatedPlayers, loserId, events);
}

// ---------------------------------------------------------------------------
// Turn timeout (5.7) — server-timer-triggered, not a player intent (6.5).
// ---------------------------------------------------------------------------

export function applyTimeout(state: MatchState, playerId: string): EngineResult {
  if (state.phase !== GamePhase.BIDDING) {
    return fail(ErrorCode.WRONG_PHASE, `Cannot time out a turn in phase ${state.phase}.`);
  }
  const round = state.round as RoundState;
  const currentPlayerId = round.turnOrder[round.currentTurnIndex];
  if (playerId !== currentPlayerId) {
    return fail(ErrorCode.NOT_YOUR_TURN, `It is not ${playerId}'s turn.`);
  }
  const player = findPlayer(state, playerId) as Player;

  // Double-loss protection: a die is lost only if the player's previous round-participation
  // was NOT already an unprotected pure-stall loss (5.7). Protection alternates rather than
  // accumulating — using it resets the streak, so a third consecutive stall loses a die again.
  const isProtected = player.consecutivePureStalls > 0;

  if (isProtected) {
    const players = updatePlayer(state.players, playerId, (p) => ({
      ...p,
      consecutivePureStalls: 0,
    }));
    const currentTurnIndex = (round.currentTurnIndex + 1) % round.turnOrder.length;
    const newState: MatchState = { ...state, players, round: { ...round, currentTurnIndex } };
    return ok(newState, [{ type: 'TURN_TIMED_OUT', playerId, dieLost: false }]);
  }

  const updatedPlayers = updatePlayer(state.players, playerId, (p) => ({
    ...p,
    consecutivePureStalls: 1,
    diceCount: p.diceCount - 1,
  }));
  const events: ServerEvent[] = [
    { type: 'TURN_TIMED_OUT', playerId, dieLost: true },
    {
      type: 'PLAYER_LOST_DIE',
      playerId,
      reason: 'TIMEOUT',
      remainingDice: (updatedPlayers.find((p) => p.id === playerId) as Player).diceCount,
    },
  ];
  return finishRoundAfterLoss(state, updatedPlayers, playerId, events);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function applyIntent(state: MatchState, intent: Intent, deps: EngineDeps): EngineResult {
  if (!isIntentAllowedInPhase(state.phase, intent.type)) {
    return fail(ErrorCode.WRONG_PHASE, `${intent.type} is not allowed in phase ${state.phase}.`);
  }
  switch (intent.type) {
    case 'JOIN_ROOM':
      return applyJoinRoom(state, intent);
    case 'SET_READY':
      return applySetReady(state, intent);
    case 'ROLL_DICE':
      return applyRollDice(state, intent, deps);
    case 'PLACE_BID':
      return applyPlaceBid(state, intent);
    case 'CALL_LIAR':
      return applyCallLiar(state, intent);
    case 'DECLARE_SPECIAL_ROUND':
      return applyDeclareSpecialRound(state, intent);
    default:
      return assertNever(intent);
  }
}

export const GameEngine = {
  createInitialMatchState,
  applyIntent,
  applyTimeout,
};
