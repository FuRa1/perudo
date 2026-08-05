import type { Socket, Server } from 'socket.io';
import {
  ErrorCode,
  GamePhase,
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
): Promise<{ s1: MockSocket; s2: MockSocket }> {
  const s1 = makeSocket('p1');
  const s2 = makeSocket('p2');
  await gateway.handleJoinRoom(s1.socket, { roomId, nickname: 'P1' });
  await gateway.handleJoinRoom(s2.socket, { roomId, nickname: 'P2' });

  // Swap in a deterministic roller so the test knows the "server-held" dice ground truth —
  // this is the one piece of white-box setup; everything else goes through real handlers.
  const room = rooms.find(roomId) as RoomRuntime;
  (room as unknown as { diceRoller: DiceRoller }).diceRoller = new SequenceDiceRoller(sequence);

  await gateway.handleSetReady(s1.socket, { isReady: true });
  await gateway.handleSetReady(s2.socket, { isReady: true });
  await gateway.handleRollDice(s1.socket); // start-roll: p1
  await gateway.handleRollDice(s2.socket); // start-roll: p2 (decides), then round 1 hands auto-deal

  return { s1, s2 };
}

describe('GameGateway — server-authoritative round resolution (transport boundary)', () => {
  let rooms: RoomsService;
  let gateway: GameGateway;
  let mockServer: ReturnType<typeof makeServer>;

  beforeEach(() => {
    rooms = new RoomsService();
    gateway = new GameGateway(rooms);
    mockServer = makeServer();
    (gateway as unknown as { server: Server }).server = mockServer.server;
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
