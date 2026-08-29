import type { Socket, Server } from 'socket.io';
import {
  ErrorCode,
  GamePhase,
  RULES_CONFIG,
  SequenceDiceRoller,
  normalBid,
  type DiceRoller,
  type DiceValue,
  type GameError,
  type MatchState,
  type ServerEvent,
} from '@shared';
import { GameGateway } from './game.gateway';
import { RoomsService, type RoomRuntime } from './rooms.service';
import { TimerConfigService } from './timer-config.service';
import { TurnTimerService } from './turn-timer.service';

/**
 * These tests exercise the actual @SubscribeMessage handlers — the real boundary a socket
 * payload crosses — rather than GameEngine directly, so they prove what a malicious client can
 * and cannot smuggle in over the wire (identity, dice, outcome, winner).
 */

/** A joined socket plus its own emit spy, kept separate so assertions never need to pull a
 * method reference back off the Socket-typed object (that would be an unbound method). */
interface MockSocket {
  readonly socket: Socket;
  readonly emit: jest.Mock;
}

function makeSocket(id: string): MockSocket {
  const emit = jest.fn();
  const socket = { id, emit, join: jest.fn() } as unknown as Socket;
  return { socket, emit };
}

function makeServer(): { server: Server; emit: jest.Mock } {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { server: { to } as unknown as Server, emit };
}

function collectBroadcastEvents(emit: jest.Mock): ServerEvent[] {
  return emit.mock.calls
    .filter(([channel]: [string]) => channel === 'events')
    .flatMap(([, events]: [string, ServerEvent[]]) => events);
}

function lastEmitted<T>(emit: jest.Mock, channel: string): T | undefined {
  const calls = emit.mock.calls.filter(([ch]: [string, T]) => ch === channel);
  return calls.length > 0 ? (calls[calls.length - 1] as [string, T])[1] : undefined;
}

async function setupBiddingRoom(
  gateway: GameGateway,
  rooms: RoomsService,
  roomId: string,
  sequence: readonly DiceValue[],
  // Distinct ids only matter when a test keeps two rooms alive at once and still needs to route
  // handler calls into a *specific* one afterward — the gateway maps sockets to rooms by client
  // id, so two rooms both defaulting to 'p1'/'p2' would have the second join silently steal the
  // first's routing.
  playerIds: readonly [string, string] = ['p1', 'p2'],
): Promise<{ s1: MockSocket; s2: MockSocket }> {
  const s1 = makeSocket(playerIds[0]);
  const s2 = makeSocket(playerIds[1]);
  await gateway.handleJoinRoom(s1.socket, { roomId, nickname: 'P1' });
  await gateway.handleJoinRoom(s2.socket, { roomId, nickname: 'P2' });

  // Swap in a deterministic roller so the test knows the "server-held" dice ground truth —
  // this is the one piece of white-box setup; everything else goes through real handlers.
  const room = rooms.find(roomId) as RoomRuntime;
  (room as unknown as { diceRoller: DiceRoller }).diceRoller = new SequenceDiceRoller(sequence);

  await gateway.handleSetReady(s1.socket, { isReady: true });
  await gateway.handleSetReady(s2.socket, { isReady: true });
  await gateway.handleRollDice(s1.socket); // start-roll: p1
  await gateway.handleRollDice(s2.socket); // start-roll: p2 (decides) -> ROUND_ROLLING
  await gateway.handleRollDice(s1.socket); // hand roll: p1
  await gateway.handleRollDice(s2.socket); // hand roll: p2 -> BIDDING

  return { s1, s2 };
}

describe('GameGateway — server-authoritative round resolution (transport boundary)', () => {
  let rooms: RoomsService;
  let timers: TurnTimerService;
  let gateway: GameGateway;
  let mockServer: ReturnType<typeof makeServer>;

  beforeEach(() => {
    // Reaching BIDDING now always arms a real turn timer (Phase 5) — fake timers keep every test
    // in this file deterministic and instant instead of leaving real 25-55s timers dangling.
    jest.useFakeTimers();
    rooms = new RoomsService();
    timers = new TurnTimerService(rooms, new TimerConfigService());
    gateway = new GameGateway(rooms, timers);
    mockServer = makeServer();
    (gateway as unknown as { server: Server }).server = mockServer.server;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('derives the liar-call result from server-held dice, ignoring anything a client attempts to attach', async () => {
    // p1 wins the start roll (6 > 3), deals itself five 3s, p2 deals five 2s.
    const sequence: DiceValue[] = [6, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2];
    const { s1, s2 } = await setupBiddingRoom(gateway, rooms, 'room-1', sequence);

    await gateway.handlePlaceBid(s1.socket, { bid: { kind: 'NORMAL', quantity: 6, face: 3 } });

    // handleCallLiar takes no @MessageBody at all — there is no parameter for a payload to land
    // in. Calling it with a bogus second argument proves that even if something were sent, the
    // handler has no code path that could read it.
    type CallLiarWithPayload = (client: Socket, payload: unknown) => Promise<void>;
    await (gateway.handleCallLiar as unknown as CallLiarWithPayload)(s2.socket, {
      outcome: 'CALLER_LOSES',
      winnerId: 'p1',
      dice: { p1: [1, 1, 1, 1, 1], p2: [1, 1, 1, 1, 1] },
    });

    const events = collectBroadcastEvents(mockServer.emit);
    const reveal = events.find((e) => e.type === 'ROUND_REVEALED');
    expect(reveal).toMatchObject({
      actualQuantity: 5, // 5 real threes, 0 aces — not the injected all-ones hands
      outcome: 'BIDDER_LOSES', // 5 < claimed 6
      loserId: 'p1',
    });
    expect(reveal).toMatchObject({ dice: { p1: [3, 3, 3, 3, 3], p2: [2, 2, 2, 2, 2] } });

    const finalState = lastEmitted<MatchState>(s1.emit, 'state');
    expect(finalState?.winnerId).toBeNull(); // p1 still has dice; no injected winner took effect
  });

  it('rejects malformed bid payloads outright, and silently discards outcome/winner/dice fields smuggled onto an otherwise-valid bid', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1, s2 } = await setupBiddingRoom(gateway, rooms, 'room-2', sequence);

    // (a) Structurally invalid bid — rejected, no state mutation.
    await gateway.handlePlaceBid(s1.socket, { bid: { kind: 'NORMAL', quantity: 'six', face: 3 } });
    const rejectedError = lastEmitted<GameError>(s1.emit, 'error');
    expect(rejectedError?.code).toBe(ErrorCode.ILLEGAL_BID);
    const roomAfterReject = rooms.find('room-2') as RoomRuntime;
    expect(roomAfterReject.state.round?.bidHistory).toHaveLength(0);

    // (b) Valid bid shape with extra outcome/winner/dice fields riding along — the gateway only
    // reads quantity/kind/face; nothing else in the object can reach state.
    await gateway.handlePlaceBid(s1.socket, {
      bid: {
        kind: 'NORMAL',
        quantity: 1,
        face: 3,
        outcome: 'CALLER_LOSES',
        winnerId: 'p1',
        dice: { p2: [6, 6, 6, 6, 6] },
      },
    });
    const roomAfterSmuggle = rooms.find('room-2') as RoomRuntime;
    expect(roomAfterSmuggle.state.round?.bidHistory).toHaveLength(1);
    expect(roomAfterSmuggle.state.winnerId).toBeNull();
    expect(roomAfterSmuggle.state.players.find((p) => p.id === 'p2')?.dice).toEqual([
      4, 4, 4, 4, 4,
    ]); // untouched by the injected `dice` payload

    // (c) Top-level fields outside `bid` (the only key the handler reads) are ignored too.
    await gateway.handlePlaceBid(s2.socket, {
      bid: normalBid(2, 3),
      winnerId: 'attacker-declared-winner',
      outcome: 'BIDDER_LOSES',
    });
    const roomAfterTopLevel = rooms.find('room-2') as RoomRuntime;
    expect(roomAfterTopLevel.state.winnerId).toBeNull();
    expect(roomAfterTopLevel.state.round?.bidHistory).toHaveLength(2);
  });

  it('never lets a player act as another player, whether by wrong-turn call or a spoofed playerId field', async () => {
    const sequence: DiceValue[] = [6, 3, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4];
    const { s2 } = await setupBiddingRoom(gateway, rooms, 'room-3', sequence);
    // p1 won the start roll and goes first; it is not p2's turn yet.

    await gateway.handlePlaceBid(s2.socket, { bid: normalBid(1, 3) });
    expect(lastEmitted<GameError>(s2.emit, 'error')?.code).toBe(ErrorCode.NOT_YOUR_TURN);

    // Claiming to be p1 via a payload field changes nothing — identity comes from the socket's
    // own joined context (client.id), never from anything the client asserts about itself.
    await gateway.handlePlaceBid(s2.socket, { playerId: 'p1', bid: normalBid(1, 3) });
    expect(lastEmitted<GameError>(s2.emit, 'error')?.code).toBe(ErrorCode.NOT_YOUR_TURN);

    const room = rooms.find('room-3') as RoomRuntime;
    expect(room.state.round?.bidHistory).toHaveLength(0);

    // A socket that never joined has no context at all — every intent bounces before reaching
    // the engine.
    const ghost = makeSocket('ghost');
    await gateway.handleCallLiar(ghost.socket);
    expect(lastEmitted<GameError>(ghost.emit, 'error')?.code).toBe(ErrorCode.ROOM_NOT_FOUND);
  });

  it('filters opponents’ dice out of every BIDDING-phase state snapshot', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5];
    const { s1, s2 } = await setupBiddingRoom(gateway, rooms, 'room-4', sequence);

    const p1View = lastEmitted<MatchState>(s1.emit, 'state') as MatchState;
    expect(p1View.players.find((p) => p.id === 'p1')?.dice).toEqual([2, 2, 2, 2, 2]);
    expect(p1View.players.find((p) => p.id === 'p2')?.dice).toEqual([]);
    expect(p1View.players.find((p) => p.id === 'p2')?.diceCount).toBe(5); // count stays visible

    const p2View = lastEmitted<MatchState>(s2.emit, 'state') as MatchState;
    expect(p2View.players.find((p) => p.id === 'p2')?.dice).toEqual([5, 5, 5, 5, 5]);
    expect(p2View.players.find((p) => p.id === 'p1')?.dice).toEqual([]);
  });

  it('makes the ROUND_REVEALED event the only channel that ever carries an opponent’s actual dice', async () => {
    const sequence: DiceValue[] = [6, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2];
    const { s1, s2 } = await setupBiddingRoom(gateway, rooms, 'room-5', sequence);

    // Before the call: neither player's personal state snapshot has ever shown p2's real hand.
    const preCallView = lastEmitted<MatchState>(s1.emit, 'state') as MatchState;
    expect(preCallView.players.find((p) => p.id === 'p2')?.dice).toEqual([]);

    await gateway.handlePlaceBid(s1.socket, { bid: { kind: 'NORMAL', quantity: 6, face: 3 } });
    await gateway.handleCallLiar(s2.socket);

    // After the call: the personal state snapshot still never carries p2's dice (round moved on
    // and hands were cleared) — the only place p1's raw values appear is the public event.
    const postCallView = lastEmitted<MatchState>(s1.emit, 'state') as MatchState;
    expect(postCallView.players.find((p) => p.id === 'p2')?.dice).toEqual([]);

    const events = collectBroadcastEvents(mockServer.emit);
    const reveal = events.find((e) => e.type === 'ROUND_REVEALED');
    expect(reveal).toMatchObject({ dice: { p1: [3, 3, 3, 3, 3], p2: [2, 2, 2, 2, 2] } });
  });

  it('declares GAME_OVER and winnerId identically to both clients, with nothing for the UI to compute', async () => {
    const s1 = makeSocket('p1');
    const s2 = makeSocket('p2');
    await gateway.handleJoinRoom(s1.socket, { roomId: 'room-6', nickname: 'P1' });
    await gateway.handleJoinRoom(s2.socket, { roomId: 'room-6', nickname: 'P2' });

    // Fast-forward straight to a decisive BIDDING state (server-side test setup, not a client
    // action) so the match-ending call can be exercised without playing out several rounds.
    const room = rooms.find('room-6') as RoomRuntime;
    room.state = {
      phase: GamePhase.BIDDING,
      roomId: 'room-6',
      players: [
        {
          id: 'p1',
          nickname: 'P1',
          isReady: true,
          diceCount: 1,
          dice: [2],
          consecutivePureStalls: 0,
        },
        {
          id: 'p2',
          nickname: 'P2',
          isReady: true,
          diceCount: 3,
          dice: [6, 6, 6],
          consecutivePureStalls: 0,
        },
      ],
      startRoll: null,
      completedStartRoll: null,
      round: {
        roundNumber: 5,
        turnOrder: ['p1', 'p2'],
        currentTurnIndex: 1,
        bidHistory: [{ playerId: 'p1', bid: normalBid(4, 6) }], // only 3 sixes actually exist
        isSpecialRoundDeclared: false,
        pendingRolls: [],
      },
      winnerId: null,
    };

    await gateway.handleCallLiar(s2.socket);

    const events = collectBroadcastEvents(mockServer.emit);
    expect(events.some((e) => e.type === 'MATCH_WON' && e.winnerId === 'p2')).toBe(true);

    const p1Final = lastEmitted<MatchState>(s1.emit, 'state') as MatchState;
    const p2Final = lastEmitted<MatchState>(s2.emit, 'state') as MatchState;
    expect(p1Final.phase).toBe(GamePhase.GAME_OVER);
    expect(p2Final.phase).toBe(GamePhase.GAME_OVER);
    expect(p1Final.winnerId).toBe('p2');
    expect(p2Final.winnerId).toBe('p2'); // same authoritative value for every viewer, unfiltered
  });
});

interface JoinedPayload {
  playerId: string;
  roomId: string;
  reconnectToken: string;
}

describe('GameGateway — Phase 5: reconnect sessions and server-authoritative turn timers', () => {
  let rooms: RoomsService;
  let timers: TurnTimerService;
  let gateway: GameGateway;
  let mockServer: ReturnType<typeof makeServer>;

  const { quietPhaseEndMs, audiblePhaseEndMs, baseTurnMs, personalBankMs } = RULES_CONFIG.turnTimer;
  const BANK_DEADLINE_MS = baseTurnMs + personalBankMs;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    rooms = new RoomsService();
    timers = new TurnTimerService(rooms, new TimerConfigService());
    gateway = new GameGateway(rooms, timers);
    mockServer = makeServer();
    (gateway as unknown as { server: Server }).server = mockServer.server;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('restores the same slot by reconnect token, with a correctly filtered snapshot and no duplicate player', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'reconnect-room', sequence);
    const token = lastEmitted<JoinedPayload>(s1.emit, 'joined')?.reconnectToken as string;
    expect(token).toBeTruthy();

    const s1New = makeSocket('p1-new-socket');
    await gateway.handleReconnect(s1New.socket, { roomId: 'reconnect-room', token });

    expect(lastEmitted<JoinedPayload>(s1New.emit, 'joined')).toMatchObject({
      playerId: 'p1',
      roomId: 'reconnect-room',
    });
    const restored = lastEmitted<MatchState>(s1New.emit, 'state') as MatchState;
    expect(restored.players.map((p) => p.id).sort()).toEqual(['p1', 'p2']); // no duplicate player
    expect(restored.players.find((p) => p.id === 'p1')?.dice).toEqual([2, 2, 2, 2, 2]); // own dice
    expect(restored.players.find((p) => p.id === 'p2')?.dice).toEqual([]); // opponent still hidden

    const room = rooms.find('reconnect-room') as RoomRuntime;
    expect(room.sockets.get('p1')).toBe(s1New.socket); // the old p1 socket was replaced, not duplicated

    // The old socket's context was invalidated — it can no longer act as p1.
    await gateway.handlePlaceBid(s1.socket, { bid: normalBid(1, 2) });
    expect(lastEmitted<GameError>(s1.emit, 'error')?.code).toBe(ErrorCode.ROOM_NOT_FOUND);
  });

  it('rejects an invalid or unknown reconnect token, and never creates a room as a side effect', async () => {
    const ghost = makeSocket('ghost');
    await gateway.handleReconnect(ghost.socket, { roomId: 'never-existed', token: 'bogus' });
    expect(lastEmitted<GameError>(ghost.emit, 'error')?.code).toBe(ErrorCode.INVALID_TOKEN);
    expect(rooms.find('never-existed')).toBeUndefined();

    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    await setupBiddingRoom(gateway, rooms, 'real-room', sequence);
    const impostor = makeSocket('impostor');
    await gateway.handleReconnect(impostor.socket, { roomId: 'real-room', token: 'not-a-token' });
    expect(lastEmitted<GameError>(impostor.emit, 'error')?.code).toBe(ErrorCode.INVALID_TOKEN);
  });

  it('never exposes a reconnect token to anyone but its owner, and it never appears inside game state', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1, s2 } = await setupBiddingRoom(gateway, rooms, 'token-room', sequence);
    const p1Token = lastEmitted<JoinedPayload>(s1.emit, 'joined')?.reconnectToken;
    const p2StateCalls = s2.emit.mock.calls.filter(([ch]: [string]) => ch === 'state');
    for (const [, snapshot] of p2StateCalls) {
      expect(JSON.stringify(snapshot)).not.toContain(p1Token);
    }
    const eventsCalls = mockServer.emit.mock.calls;
    for (const call of eventsCalls) {
      expect(JSON.stringify(call)).not.toContain(p1Token);
    }
  });

  it('arms a turn timer the moment BIDDING begins, with the correct quiet/warning/bank boundaries', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'timer-room', sequence);
    const state = lastEmitted<
      MatchState & { turnTimer: ReturnType<TurnTimerService['buildView']> }
    >(s1.emit, 'state');
    expect(state?.turnTimer).toMatchObject({
      playerId: 'p1', // p1 won the start roll (6 > 3)
      quietPhaseEndsAt: quietPhaseEndMs,
      warningPhaseEndsAt: audiblePhaseEndMs,
      bankDeadlineAt: BANK_DEADLINE_MS,
    });
  });

  it('resets the timer to the next player after a valid bid, and cancels it when the round ends via call-liar', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1, s2 } = await setupBiddingRoom(gateway, rooms, 'reset-room', sequence);

    jest.setSystemTime(5_000);
    await gateway.handlePlaceBid(s1.socket, { bid: normalBid(1, 2) });
    const afterBid = lastEmitted<
      MatchState & { turnTimer: ReturnType<TurnTimerService['buildView']> }
    >(s2.emit, 'state');
    expect(afterBid?.turnTimer).toMatchObject({ playerId: 'p2', turnStartedAt: 5_000 });

    await gateway.handleCallLiar(s2.socket);
    const afterCall = lastEmitted<
      MatchState & { turnTimer: ReturnType<TurnTimerService['buildView']> }
    >(s1.emit, 'state');
    // The round ended (win or a fresh round starting) — no BIDDING timer until hands are rolled again.
    expect(afterCall?.turnTimer).toBeNull();
  });

  it('a stale scheduled timeout does nothing once a valid bid already cancelled it', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'stale-room', sequence);

    // 1ms before p1's bank would time out, p1 places a valid bid instead.
    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS - 1);
    await gateway.handlePlaceBid(s1.socket, { bid: normalBid(1, 2) });

    // Pass p1's original (now-cancelled) deadline — but stay well inside p2's own fresh timer
    // (armed for the bid, starting the clock over), so this only proves the *stale* callback did
    // nothing, without a legitimate new timeout for p2 muddying the assertion.
    await jest.advanceTimersByTimeAsync(100);
    const room = rooms.find('stale-room') as RoomRuntime;
    expect(room.state.players.find((p) => p.id === 'p1')?.diceCount).toBe(5); // untouched
    const events = collectBroadcastEvents(mockServer.emit);
    expect(events.some((e) => e.type === 'TURN_TIMED_OUT')).toBe(false);
  });

  it('removes a die when the bank genuinely runs out, and moves the match on', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    await setupBiddingRoom(gateway, rooms, 'timeout-room', sequence);

    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS);

    const events = collectBroadcastEvents(mockServer.emit);
    expect(events.some((e) => e.type === 'TURN_TIMED_OUT' && e.dieLost === true)).toBe(true);
    const room = rooms.find('timeout-room') as RoomRuntime;
    expect(room.state.players.find((p) => p.id === 'p1')?.diceCount).toBe(4);
    expect(room.state.phase).toBe(GamePhase.ROUND_ROLLING); // the round ended immediately (5.7)
    // No BIDDING timer is armed again until the next round's hands are rolled.
    expect(room.timer).toBeNull();
  });

  it('protects a second consecutive pure stall from losing a die, and re-arms a timer for the next player', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    await setupBiddingRoom(gateway, rooms, 'protect-room', sequence);
    const room = rooms.find('protect-room') as RoomRuntime;
    // Simulate p1 having already pure-stalled once, immediately before this timeout.
    room.state = {
      ...room.state,
      players: room.state.players.map((p) =>
        p.id === 'p1' ? { ...p, consecutivePureStalls: 1 } : p,
      ),
    };

    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS);

    const events = collectBroadcastEvents(mockServer.emit);
    expect(events.some((e) => e.type === 'TURN_TIMED_OUT' && e.dieLost === false)).toBe(true);
    expect(room.state.players.find((p) => p.id === 'p1')?.diceCount).toBe(5); // unchanged
    expect(room.state.phase).toBe(GamePhase.BIDDING); // round continues, turn just passed
    expect(room.timer?.playerId).toBe('p2'); // a fresh timer is armed for the next player
  });

  it('applies the special-round 7-second bonus to the round-first-player timer on declaration', async () => {
    const players: MatchState['players'] = [
      {
        id: 'p1',
        nickname: 'P1',
        isReady: true,
        diceCount: 1,
        dice: [2],
        consecutivePureStalls: 0,
      },
      {
        id: 'p2',
        nickname: 'P2',
        isReady: true,
        diceCount: 4,
        dice: [3, 3, 3, 3],
        consecutivePureStalls: 0,
      },
    ];
    const s1 = makeSocket('p1');
    const s2 = makeSocket('p2');
    await gateway.handleJoinRoom(s1.socket, { roomId: 'special-room', nickname: 'P1' });
    await gateway.handleJoinRoom(s2.socket, { roomId: 'special-room', nickname: 'P2' });
    const room = rooms.find('special-room') as RoomRuntime;
    room.state = {
      phase: GamePhase.BIDDING,
      roomId: 'special-room',
      players,
      startRoll: null,
      completedStartRoll: null,
      round: {
        roundNumber: 3,
        turnOrder: ['p1', 'p2'],
        currentTurnIndex: 0,
        bidHistory: [],
        isSpecialRoundDeclared: false,
        pendingRolls: [],
      },
      winnerId: null,
    };
    timers.startTimer(room, 'p1');

    await gateway.handleDeclareSpecialRound(s1.socket);

    const view = timers.buildView(room);
    expect(view).toMatchObject({
      playerId: 'p1',
      quietPhaseEndsAt: quietPhaseEndMs + 7_000,
      warningPhaseEndsAt: audiblePhaseEndMs + 7_000,
      bankDeadlineAt: BANK_DEADLINE_MS + 7_000,
    });
  });

  it('disconnect pauses the bank (never spent automatically) and reconnect resumes it, per 5.6', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'disconnect-room', sequence);
    const token = lastEmitted<JoinedPayload>(s1.emit, 'joined')?.reconnectToken as string;

    jest.setSystemTime(baseTurnMs + 3_000); // 3s into the bank phase
    await gateway.handleDisconnect(s1.socket);
    const room = rooms.find('disconnect-room') as RoomRuntime;
    expect(timers.buildView(room)?.bankDeadlineAt).toBeNull();
    expect(timers.buildView(room)?.bankMsRemaining).toBe(personalBankMs - 3_000);

    jest.setSystemTime(baseTurnMs + 20_000); // stays disconnected for a while — not spent (5.6)
    expect(timers.buildView(room)?.bankMsRemaining).toBe(personalBankMs - 3_000);

    const s1New = makeSocket('p1-reconnected');
    await gateway.handleReconnect(s1New.socket, { roomId: 'disconnect-room', token });
    expect(timers.buildView(room)?.bankDeadlineAt).toBe(
      baseTurnMs + 20_000 + (personalBankMs - 3_000),
    );
  });

  it('applies the hard disconnect fallback so a permanently-absent active player cannot stall the match forever', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    await setupBiddingRoom(gateway, rooms, 'fallback-room', sequence);
    const room = rooms.find('fallback-room') as RoomRuntime;

    jest.setSystemTime(1_000); // well before the base 25s window even ends
    await gateway.handleDisconnect(room.sockets.get('p1') as Socket);

    await jest.advanceTimersByTimeAsync(RULES_CONFIG.reconnectWaitWindowMs);

    const events = collectBroadcastEvents(mockServer.emit);
    expect(events.some((e) => e.type === 'TURN_TIMED_OUT' && e.dieLost === true)).toBe(true);
    expect(room.state.players.find((p) => p.id === 'p1')?.diceCount).toBe(4);
  });

  it('never applies a timeout meant for one room to another', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    await setupBiddingRoom(gateway, rooms, 'concurrent-room', sequence);
    await setupBiddingRoom(gateway, rooms, 'other-room', [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4]);

    // Only concurrent-room's timer reaches its deadline; other-room's timer (started at the same
    // fake time, so it would also be due) must never be touched by concurrent-room's own firing.
    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS);

    const room = rooms.find('concurrent-room') as RoomRuntime;
    const otherRoom = rooms.find('other-room') as RoomRuntime;
    expect(room.state.players.find((p) => p.id === 'p1')?.diceCount).toBe(4);
    expect(otherRoom.state.players.find((p) => p.id === 'p1')?.diceCount).toBe(4);
    // Each room's timeout only ever touched its own room's players — no cross-room leakage.
    expect(room.state.players.find((p) => p.id === 'p2')?.diceCount).toBe(5);
    expect(otherRoom.state.players.find((p) => p.id === 'p2')?.diceCount).toBe(5);
  });

  it('a bid that arrives and is accepted just before the deadline cleanly cancels the pending timeout (no race corruption)', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'race-room', sequence);

    await jest.advanceTimersByTimeAsync(BANK_DEADLINE_MS - 1);
    await gateway.handlePlaceBid(s1.socket, { bid: normalBid(1, 2) });
    await jest.advanceTimersByTimeAsync(1); // the original deadline instant, now stale

    const room = rooms.find('race-room') as RoomRuntime;
    expect(room.state.round?.bidHistory).toHaveLength(1);
    expect(room.state.players.find((p) => p.id === 'p1')?.diceCount).toBe(5); // the bid won, not the timeout
    expect(room.timer?.playerId).toBe('p2'); // a fresh timer, not the stale one
  });
});

describe('GameGateway — setTimerMode: per-room timer toggle', () => {
  let rooms: RoomsService;
  let timers: TurnTimerService;
  let gateway: GameGateway;
  let mockServer: ReturnType<typeof makeServer>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    rooms = new RoomsService();
    timers = new TurnTimerService(rooms, new TimerConfigService());
    gateway = new GameGateway(rooms, timers);
    mockServer = makeServer();
    (gateway as unknown as { server: Server }).server = mockServer.server;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("disabling timers cancels the room's active timer and blocks new ones from starting, without touching another room", async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'toggle-room', sequence);
    // Distinct ids so this room's join doesn't steal 'toggle-room' socket routing (see
    // setupBiddingRoom's doc comment).
    await setupBiddingRoom(gateway, rooms, 'other-room', sequence, ['op1', 'op2']);

    const toggleRoom = rooms.find('toggle-room') as RoomRuntime;
    const otherRoom = rooms.find('other-room') as RoomRuntime;
    expect(toggleRoom.timer).not.toBeNull();
    expect(otherRoom.timer).not.toBeNull();

    await gateway.handleSetTimerMode(s1.socket, { enabled: false });

    expect(toggleRoom.timer).toBeNull(); // cancelled immediately, no restart needed
    expect(otherRoom.timer).not.toBeNull(); // a different room's timer is never touched

    // A fresh bid in the disabled room must not re-arm a timer.
    await gateway.handlePlaceBid(s1.socket, { bid: normalBid(1, 2) });
    expect(toggleRoom.timer).toBeNull();
  });

  it('re-enabling timers starts a fresh one for the current turn', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'reenable-room', sequence);
    await gateway.handleSetTimerMode(s1.socket, { enabled: false });
    const room = rooms.find('reenable-room') as RoomRuntime;
    expect(room.timer).toBeNull();

    await gateway.handleSetTimerMode(s1.socket, { enabled: true });
    expect(room.timer).not.toBeNull();
    expect(room.timer?.playerId).toBe('p1'); // still p1's turn, nothing else happened
  });

  it('broadcasts timerModeChanged to the whole room', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'broadcast-room', sequence);

    await gateway.handleSetTimerMode(s1.socket, { enabled: false });

    expect(mockServer.emit).toHaveBeenCalledWith('timerModeChanged', { enabled: false });
  });

  it('rejects a non-boolean payload without mutating any room state', async () => {
    const sequence: DiceValue[] = [6, 3, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
    const { s1 } = await setupBiddingRoom(gateway, rooms, 'invalid-room', sequence);
    const room = rooms.find('invalid-room') as RoomRuntime;
    const timerBefore = room.timer;

    await gateway.handleSetTimerMode(s1.socket, { enabled: 'nope' });

    expect(lastEmitted<GameError>(s1.emit, 'error')?.code).toBe(ErrorCode.WRONG_PHASE);
    expect(room.timer).toBe(timerBefore);
  });

  it('rejects the message from a socket that has not joined a room yet', async () => {
    const stray = makeSocket('stray');
    await gateway.handleSetTimerMode(stray.socket, { enabled: false });
    expect(lastEmitted<GameError>(stray.emit, 'error')?.code).toBe(ErrorCode.ROOM_NOT_FOUND);
  });
});
