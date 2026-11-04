import type { DiceValue, MatchState, RoundResultView, ServerEvent, StartRollView } from '@shared';

/**
 * Public facts derived from engine events that the MatchState itself no longer holds once the
 * engine has moved on (the revealed dice, the tied start-roll values, who won the start roll).
 */
export interface RoomRecap {
  readonly lastResult: RoundResultView | null;
  readonly previousTie: StartRollView['previousTie'];
  readonly startRollWinnerId: string | null;
}

export const EMPTY_RECAP: RoomRecap = {
  lastResult: null,
  previousTie: null,
  startRollWinnerId: null,
};

function startRollValuesOf(
  previous: MatchState,
  events: readonly ServerEvent[],
): Record<string, DiceValue> {
  const rolls: Record<string, DiceValue> = { ...previous.startRoll?.rolls };
  for (const event of events) {
    if (event.type === 'START_ROLL_ROLLED') {
      rolls[event.playerId] = event.value;
    }
  }
  return rolls;
}

function reduceEvent(
  recap: RoomRecap,
  event: ServerEvent,
  previous: MatchState,
  events: readonly ServerEvent[],
): RoomRecap {
  const roundNumber = previous.round?.roundNumber ?? 0;
  switch (event.type) {
    case 'START_ROLL_TIED':
      return {
        ...recap,
        previousTie: {
          tiedPlayerIds: event.tiedPlayerIds,
          rolls: startRollValuesOf(previous, events),
        },
      };
    case 'ROUND_STARTED':
      return event.roundNumber === 1
        ? { ...recap, previousTie: null, startRollWinnerId: event.firstPlayerId }
        : recap;
    case 'ROUND_REVEALED': {
      const liarCall = events.find((e) => e.type === 'LIAR_CALLED');
      const lastResult: RoundResultView = {
        kind: 'REVEAL',
        roundNumber,
        callerId: liarCall?.callerId ?? '',
        bidderId: event.bidderId,
        claimedBid: event.claimedBid,
        actualQuantity: event.actualQuantity,
        outcome: event.outcome,
        loserId: event.loserId,
        wasSpecialRound: previous.round?.isSpecialRoundDeclared ?? false,
        dice: event.dice,
      };
      return { ...recap, lastResult };
    }
    case 'TURN_TIMED_OUT':
      return {
        ...recap,
        lastResult: {
          kind: 'TIMEOUT',
          roundNumber,
          playerId: event.playerId,
          isDieLost: event.dieLost,
        },
      };
    default:
      return recap;
  }
}

/** Folds one engine step's events into the recap. `previous` is the state before the step. */
export function applyEventsToRecap(
  recap: RoomRecap,
  previous: MatchState,
  events: readonly ServerEvent[],
): RoomRecap {
  return events.reduce((acc, event) => reduceEvent(acc, event, previous, events), recap);
}
