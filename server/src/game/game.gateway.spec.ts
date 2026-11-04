import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CLIENT_EVENTS,
  ErrorCode,
  GamePhase,
  SERVER_EVENTS,
  SequenceDiceRoller,
  type ActionResult,
  type JoinedRoom,
  type PlayerView,
} from '@shared';
import { io, type Socket } from 'socket.io-client';
import { DICE_ROLLER } from './crypto-dice-roller';
import { GameModule } from './game.module';

/** A test player: a real socket.io client plus the latest snapshot it was sent. */
class TestClient {
  latest: PlayerView | null = null;
  private waiters: Array<{ predicate: (v: PlayerView) => boolean; resolve: () => void }> = [];

  constructor(readonly socket: Socket) {
    socket.on(SERVER_EVENTS.STATE, (view: PlayerView) => {
      this.latest = view;
      this.waiters = this.waiters.filter((waiter) => {
        if (!waiter.predicate(view)) {
          return true;
        }
        waiter.resolve();
        return false;
      });
    });
  }

  send<T = null>(event: string, payload: unknown = {}): Promise<ActionResult<T>> {
    return this.socket.emitWithAck(event, payload) as Promise<ActionResult<T>>;
  }

  async waitFor(predicate: (view: PlayerView) => boolean): Promise<PlayerView> {
    if (!this.latest || !predicate(this.latest)) {
      await new Promise<void>((resolve) => this.waiters.push({ predicate, resolve }));
    }
    return this.latest as PlayerView;
  }
}

function expectOk<T>(result: ActionResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

describe('GameGateway — a full networked match (Phase 3 readiness)', () => {
  let app: INestApplication;
  let url: string;
  const clients: TestClient[] = [];

  async function connect(): Promise<TestClient> {
    const socket = io(url, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const client = new TestClient(socket);
    clients.push(client);
    return client;
  }

  beforeEach(async () => {
    // Start roll: Jack 6, Will 2 → Jack bids first. Every hand after that is all twos.
    const moduleRef = await Test.createTestingModule({ imports: [GameModule] })
      .overrideProvider(DICE_ROLLER)
      .useValue(new SequenceDiceRoller([6, 2]))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = await app.getUrl();
  });

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.socket.disconnect());
    await app.close();
  });

  it('plays from lobby to a winner, sending each player only their own dice', async () => {
    const jack = await connect();
    const will = await connect();

    const { roomId } = expectOk(
      await jack.send<JoinedRoom>(CLIENT_EVENTS.CREATE_ROOM, { nickname: 'Jack' }),
    );
    expectOk(await will.send<JoinedRoom>(CLIENT_EVENTS.JOIN_ROOM, { roomId, nickname: 'Will' }));
    expectOk(await jack.send(CLIENT_EVENTS.SET_READY, { isReady: true }));
    expectOk(await will.send(CLIENT_EVENTS.SET_READY, { isReady: true }));
    expectOk(await jack.send(CLIENT_EVENTS.ROLL_DICE));
    expectOk(await will.send(CLIENT_EVENTS.ROLL_DICE));

    const afterStartRoll = await will.waitFor((v) => v.phase === GamePhase.ROUND_ROLLING);
    expect(afterStartRoll.startRollWinnerId).toBe(afterStartRoll.players[0]?.id);

    for (let round = 1; round <= 5; round += 1) {
      expectOk(await jack.send(CLIENT_EVENTS.ROLL_DICE));
      expectOk(await will.send(CLIENT_EVENTS.ROLL_DICE));
      const bidding = await jack.waitFor((v) => v.phase === GamePhase.BIDDING);
      expect(bidding.myDice).toHaveLength(6 - round);
      // Only the previous round's reveal may carry other players' dice — the live round's never.
      expect(bidding.lastResult?.roundNumber ?? 0).toBeLessThan(round);
      expect(JSON.stringify({ ...bidding, lastResult: null })).not.toContain('"dice"');

      // Jack claims a three that doesn't exist; Will calls liar; Jack loses a die.
      const bid = { bid: { kind: 'NORMAL', quantity: 1, face: 3 } };
      expectOk(await jack.send(CLIENT_EVENTS.PLACE_BID, bid));
      expectOk(await will.send(CLIENT_EVENTS.CALL_LIAR));

      const result = await will.waitFor((v) => v.lastResult?.roundNumber === round);
      expect(result.lastResult).toMatchObject({ kind: 'REVEAL', actualQuantity: 0 });
    }

    const final = await jack.waitFor((v) => v.phase === GamePhase.GAME_OVER);
    expect(final.winnerId).toBe(final.players[1]?.id);
  });

  it('answers bad intents with structured errors and keeps serving the room', async () => {
    const jack = await connect();
    expect(await jack.send(CLIENT_EVENTS.CALL_LIAR)).toMatchObject({
      ok: false,
      error: { code: ErrorCode.NOT_IN_ROOM },
    });
    expectOk(await jack.send<JoinedRoom>(CLIENT_EVENTS.CREATE_ROOM, { nickname: 'Jack' }));
    expect(await jack.send(CLIENT_EVENTS.PLACE_BID, { bid: 'six sixes' })).toMatchObject({
      ok: false,
      error: { code: ErrorCode.INVALID_PAYLOAD },
    });
    expect(await jack.send(CLIENT_EVENTS.ROLL_DICE)).toMatchObject({
      ok: false,
      error: { code: ErrorCode.WRONG_PHASE },
    });
    expectOk(await jack.send(CLIENT_EVENTS.SET_READY, { isReady: true }));
  });
});
