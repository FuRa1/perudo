import { RULES_CONFIG } from '@shared';
import type { Socket } from 'socket.io';
import { RoomsService, type RoomRuntime } from './rooms.service';
import { TimerConfigService } from './timer-config.service';
import { TurnTimerService } from './turn-timer.service';

/** A bare object standing in for a connected socket — TurnTimerService only ever asks
 * `room.sockets.has(playerId)`, it never touches the socket itself. */
function fakeSocket(): Socket {
  return {} as Socket;
}

function connect(room: RoomRuntime, playerId: string): void {
  room.sockets.set(playerId, fakeSocket());
}

function disconnect(room: RoomRuntime, playerId: string): void {
  room.sockets.delete(playerId);
}

const { quietPhaseEndMs, audiblePhaseEndMs, baseTurnMs, personalBankMs } = RULES_CONFIG.turnTimer;
const BANK_DEADLINE_MS = baseTurnMs + personalBankMs; // 55_000 when connected throughout

describe('TurnTimerService (5.6, 5.7, 6.5)', () => {
  let rooms: RoomsService;
  let timers: TurnTimerService;
  let room: RoomRuntime;
  let firedFor: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    rooms = new RoomsService();
    timers = new TurnTimerService(rooms, new TimerConfigService());
    firedFor = [];
    timers.setTimeoutHandler((_room, playerId) => {
      firedFor.push(playerId);
    });
    room = rooms.getOrCreate('room-1');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes fixed quiet/warning boundaries and a 55s bank deadline for a connected player', () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');

    const view = timers.buildView(room);
    expect(view).toMatchObject({
      playerId: 'p1',
      turnStartedAt: 0,
      quietPhaseEndsAt: quietPhaseEndMs,
      warningPhaseEndsAt: audiblePhaseEndMs,
      bankDeadlineAt: BANK_DEADLINE_MS,
      bankMsRemaining: personalBankMs,
    });
  });

  it('fires the timeout handler exactly once the full 55s elapses for a connected player', async () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');

    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS - 1);
    expect(firedFor).toEqual([]);

    await jest.advanceTimersByTimeAsync(1);
    expect(firedFor).toEqual(['p1']);
  });

  it('cancelTimer prevents the scheduled timeout from ever firing', async () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');
    timers.cancelTimer(room);

    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS + 10_000);
    expect(firedFor).toEqual([]);
    expect(timers.buildView(room)).toBeNull();
  });

  it('starting a new timer supersedes the old one — the stale callback does nothing', async () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');

    jest.setSystemTime(1_000);
    connect(room, 'p2');
    timers.startTimer(room, 'p2'); // replaces p1's timer before it could ever fire

    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS + 10_000);
    expect(firedFor).toEqual(['p2']);
  });

  it('starts a fresh timer already in the disconnected/fallback state if the player is offline the moment their turn begins', () => {
    // p1 is not connected at all — e.g. they were made the next round's first bidder while offline.
    timers.startTimer(room, 'p1');

    const view = timers.buildView(room);
    expect(view?.bankDeadlineAt).toBeNull(); // paused — 5.6, the bank is not spent while disconnected
    expect(view?.bankMsRemaining).toBe(personalBankMs);
  });

  it('applies the hard 60s disconnect fallback, bounding an otherwise-indefinite stall (resolved ambiguity)', async () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');

    jest.setSystemTime(2_000); // still in the quiet phase, well before the base 25s window ends
    disconnect(room, 'p1');
    timers.onPlayerDisconnected(room, 'p1');

    const view = timers.buildView(room);
    expect(view?.bankDeadlineAt).toBeNull();
    expect(view?.bankMsRemaining).toBe(personalBankMs); // nothing consumed yet — still pre-bank

    // Fallback fires at disconnect (2_000) + reconnectWaitWindowMs, well before the 55s bank
    // deadline would ever have been reached had they stayed connected. Current fake time is
    // already 2_000 (set above), so advance by the window's duration relative to that.
    await jest.advanceTimersByTimeAsync(RULES_CONFIG.reconnectWaitWindowMs - 1);
    expect(firedFor).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    expect(firedFor).toEqual(['p1']);
  });

  it('freezes the remaining bank on disconnect mid-bank-phase and resumes it (not from scratch) on reconnect', async () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');

    // 5s into the bank phase (30_000 - 5_000 = 25_000ms of bank left).
    jest.setSystemTime(baseTurnMs + 5_000);
    disconnect(room, 'p1');
    timers.onPlayerDisconnected(room, 'p1');
    expect(timers.buildView(room)?.bankMsRemaining).toBe(personalBankMs - 5_000);
    expect(timers.buildView(room)?.bankDeadlineAt).toBeNull();

    // Stay disconnected for a while — none of this counts against the bank (5.6).
    jest.setSystemTime(baseTurnMs + 40_000);
    expect(timers.buildView(room)?.bankMsRemaining).toBe(personalBankMs - 5_000); // still frozen

    connect(room, 'p1');
    timers.onPlayerReconnected(room, 'p1');
    const resumedAt = baseTurnMs + 40_000;
    expect(timers.buildView(room)?.bankDeadlineAt).toBe(resumedAt + (personalBankMs - 5_000));

    await jest.advanceTimersByTimeAsync(personalBankMs - 5_000 - 1);
    expect(firedFor).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    expect(firedFor).toEqual(['p1']);
  });

  it('a reconnect before the base 25s window elapses leaves the bank untouched (never started)', () => {
    disconnect(room, 'p1'); // start offline
    timers.startTimer(room, 'p1');

    jest.setSystemTime(3_000); // still well within the quiet phase
    connect(room, 'p1');
    timers.onPlayerReconnected(room, 'p1');

    const view = timers.buildView(room);
    expect(view?.bankMsRemaining).toBe(personalBankMs);
    expect(view?.bankDeadlineAt).toBe(BANK_DEADLINE_MS); // unaffected — same as never having disconnected
  });

  it('extends the pre-bank deadline by exactly the special-round bonus (5.5)', () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');

    timers.extendForSpecialRound(room);

    const view = timers.buildView(room);
    expect(view).toMatchObject({
      quietPhaseEndsAt: quietPhaseEndMs + RULES_CONFIG.specialRoundBonusTimerMs,
      warningPhaseEndsAt: audiblePhaseEndMs + RULES_CONFIG.specialRoundBonusTimerMs,
      bankDeadlineAt: BANK_DEADLINE_MS + RULES_CONFIG.specialRoundBonusTimerMs,
    });
  });

  it('extends an already-ticking bank deadline by the bonus when declared late (mid-bank)', () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');

    jest.setSystemTime(baseTurnMs + 1_000); // 1s into the bank phase already
    timers.extendForSpecialRound(room);

    expect(timers.buildView(room)?.bankDeadlineAt).toBe(
      BANK_DEADLINE_MS + RULES_CONFIG.specialRoundBonusTimerMs,
    );
  });

  it('does not extend the disconnect hard-fallback deadline (a different clock than the first-bid timer)', () => {
    connect(room, 'p1');
    timers.startTimer(room, 'p1');
    disconnect(room, 'p1');
    timers.onPlayerDisconnected(room, 'p1');

    const before = timers.buildView(room)?.bankDeadlineAt;
    timers.extendForSpecialRound(room);
    expect(timers.buildView(room)?.bankDeadlineAt).toBe(before); // still null, unaffected
  });

  it("another player disconnecting or reconnecting never touches the active turn owner's timer", () => {
    connect(room, 'p1');
    connect(room, 'p2');
    timers.startTimer(room, 'p1');
    const before = timers.buildView(room);

    disconnect(room, 'p2');
    timers.onPlayerDisconnected(room, 'p2');
    timers.onPlayerReconnected(room, 'p2'); // no-op: p2 was never the timer's owner

    expect(timers.buildView(room)).toEqual(before);
  });
});
